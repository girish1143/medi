import type { Prisma, PrismaClient } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { createAuthenticateMiddleware } from '../../middleware/authenticate';
import { authorizePermissions } from '../../middleware/authorize';
import { csrfProtection } from '../../middleware/csrf-protection';
import { validateRequest } from '../../middleware/validate-request';
import { PERMISSIONS } from '../../security/permissions';
import { SUBSCRIPTION_STATUSES } from '../../shared/constants';
import { ConflictError, NotFoundError } from '../../shared/errors';
import { asyncHandler, createdResponse, okResponse } from '../../shared/utils';
import { uuidSchema } from '../../shared/validators';
import { recordAuditLog } from '../audit-logs/audit-log.service';

const BILLING_CYCLES = ['MONTHLY', 'QUARTERLY', 'ANNUAL'] as const;

const createPlanSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .transform((v) => v.toUpperCase())
    .refine((v) => /^[A-Z0-9_]+$/.test(v), 'Plan code must contain only A-Z, 0-9, and _.'),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  targetProviderType: z.enum(['DOCTOR', 'HOSPITAL', 'BOTH']),
  billingCycle: z.enum(BILLING_CYCLES),
  priceMinor: z.number().int().min(0),
  currency: z.string().trim().length(3).transform((v) => v.toUpperCase()),
  monthlyLeadQuota: z.number().int().min(0),
  features: z.array(z.string().trim().min(1)).max(20).optional(),
  isActive: z.boolean().optional(),
});

const updatePlanSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  targetProviderType: z.enum(['DOCTOR', 'HOSPITAL', 'BOTH']).optional(),
  billingCycle: z.enum(BILLING_CYCLES).optional(),
  priceMinor: z.number().int().min(0).optional(),
  currency: z.string().trim().length(3).transform((v) => v.toUpperCase()).optional(),
  monthlyLeadQuota: z.number().int().min(0).optional(),
  features: z.array(z.string().trim().min(1)).max(20).optional(),
  isActive: z.boolean().optional(),
});

const idParam = z.object({ id: uuidSchema });

export function createSubscriptionAdminRoutes(db: PrismaClient = prisma): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(db);

  router.get(
    '/',
    authenticate,
    authorizePermissions([PERMISSIONS.SUBSCRIPTIONS_READ], db),
    asyncHandler(async (req, res) => {
      const q = String(req.query.q ?? '').trim();
      const status = String(req.query.status ?? '').trim();
      const providerType = String(req.query.providerType ?? '').trim();
      const planActiveParam = String(req.query.planActive ?? '').trim();
      const page = Math.max(1, Number(req.query.page ?? '1') || 1);
      const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize ?? '15') || 15));

      const planWhere: Prisma.SubscriptionPlanWhereInput =
        planActiveParam === 'true'
          ? { isActive: true }
          : planActiveParam === 'false'
            ? { isActive: false }
            : {};

      const subWhere: Prisma.SubscriptionWhereInput = {
        ...(status && (SUBSCRIPTION_STATUSES as readonly string[]).includes(status) ? { status } : {}),
        ...(providerType === 'DOCTOR' || providerType === 'HOSPITAL' ? { providerType } : {}),
        ...(q
          ? {
              OR: [
                { plan: { name: { contains: q } } },
                { plan: { code: { contains: q.toUpperCase() } } },
                { doctor: { user: { fullName: { contains: q } } } },
                { doctor: { user: { email: { contains: q.toLowerCase() } } } },
                { hospital: { displayName: { contains: q } } },
                { hospital: { legalName: { contains: q } } },
                { hospital: { contactEmail: { contains: q.toLowerCase() } } },
              ],
            }
          : {}),
      };

      const now = new Date();
      const soon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

      const [plans, totalPlans, activePlans, activeSubscriptions, expiringSoonCount, totalSubscriptions, subscriptions] =
        await Promise.all([
          db.subscriptionPlan.findMany({
            where: planWhere,
            orderBy: { createdAt: 'desc' },
            include: { _count: { select: { subscriptions: true } } },
          }),
          db.subscriptionPlan.count(),
          db.subscriptionPlan.count({ where: { isActive: true } }),
          db.subscription.count({ where: { status: { in: ['ACTIVE', 'TRIALING'] } } }),
          db.subscription.count({
            where: { status: { in: ['ACTIVE', 'TRIALING'] }, currentPeriodEnd: { gte: now, lte: soon } },
          }),
          db.subscription.count({ where: subWhere }),
          db.subscription.findMany({
            where: subWhere,
            orderBy: { currentPeriodEnd: 'asc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: {
              plan: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  billingCycle: true,
                  priceMinor: true,
                  currency: true,
                  monthlyLeadQuota: true,
                },
              },
              doctor: { select: { id: true, city: true, user: { select: { fullName: true, email: true } } } },
              hospital: {
                select: { id: true, displayName: true, legalName: true, contactEmail: true, city: true },
              },
            },
          }),
        ]);

      return okResponse(res, {
        summary: { totalPlans, activePlans, activeSubscriptions, expiringSoonCount },
        plans,
        subscriptions,
        pagination: { page, pageSize, total: totalSubscriptions },
      });
    }),
  );

  router.post(
    '/',
    csrfProtection,
    authenticate,
    authorizePermissions([PERMISSIONS.SUBSCRIPTIONS_MANAGE], db),
    validateRequest({ body: createPlanSchema }),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof createPlanSchema>;
      const existing = await db.subscriptionPlan.findUnique({ where: { code: body.code } });
      if (existing) {
        throw new ConflictError('DUPLICATE_PLAN_CODE', `Plan code '${body.code}' already exists.`);
      }

      const plan = await db.$transaction(async (tx) => {
        const created = await tx.subscriptionPlan.create({
          data: {
            code: body.code,
            name: body.name,
            description: body.description ?? null,
            targetProviderType: body.targetProviderType,
            billingCycle: body.billingCycle,
            priceMinor: body.priceMinor,
            currency: body.currency,
            monthlyLeadQuota: body.monthlyLeadQuota,
            featuresJson: body.features && body.features.length > 0 ? JSON.stringify(body.features) : null,
            isActive: body.isActive ?? true,
          },
          include: { _count: { select: { subscriptions: true } } },
        });
        await recordAuditLog(
          {
            actorUserId: req.principal!.userId,
            actorRole: req.principal!.role,
            action: 'SUBSCRIPTION_PLAN_CREATED',
            resourceType: 'SubscriptionPlan',
            resourceId: created.id,
            metadata: { code: created.code, priceMinor: created.priceMinor },
          },
          tx,
        );
        return created;
      });

      return createdResponse(res, { plan });
    }),
  );

  router.patch(
    '/plans/:id',
    csrfProtection,
    authenticate,
    authorizePermissions([PERMISSIONS.SUBSCRIPTIONS_MANAGE], db),
    validateRequest({ params: idParam, body: updatePlanSchema }),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof updatePlanSchema>;
      const existing = await db.subscriptionPlan.findUnique({ where: { id: String(req.params.id) } });
      if (!existing) {
        throw new NotFoundError('PLAN_NOT_FOUND', 'Subscription plan not found.');
      }

      const plan = await db.$transaction(async (tx) => {
        const updated = await tx.subscriptionPlan.update({
          where: { id: existing.id },
          data: {
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.description !== undefined ? { description: body.description || null } : {}),
            ...(body.targetProviderType !== undefined ? { targetProviderType: body.targetProviderType } : {}),
            ...(body.billingCycle !== undefined ? { billingCycle: body.billingCycle } : {}),
            ...(body.priceMinor !== undefined ? { priceMinor: body.priceMinor } : {}),
            ...(body.currency !== undefined ? { currency: body.currency } : {}),
            ...(body.monthlyLeadQuota !== undefined ? { monthlyLeadQuota: body.monthlyLeadQuota } : {}),
            ...(body.features !== undefined
              ? { featuresJson: body.features.length > 0 ? JSON.stringify(body.features) : null }
              : {}),
            ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
          },
          include: { _count: { select: { subscriptions: true } } },
        });
        await recordAuditLog(
          {
            actorUserId: req.principal!.userId,
            actorRole: req.principal!.role,
            action: 'SUBSCRIPTION_PLAN_UPDATED',
            resourceType: 'SubscriptionPlan',
            resourceId: updated.id,
          },
          tx,
        );
        return updated;
      });

      return okResponse(res, { plan });
    }),
  );

  return router;
}
