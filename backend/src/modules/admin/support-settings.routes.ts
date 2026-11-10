import type { Prisma, PrismaClient } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { createAuthenticateMiddleware } from '../../middleware/authenticate';
import { authorizePermissions } from '../../middleware/authorize';
import { csrfProtection } from '../../middleware/csrf-protection';
import { validateRequest } from '../../middleware/validate-request';
import { PERMISSIONS } from '../../security/permissions';
import { ADMIN_ROLE_CODES } from '../../shared/constants';
import { NotFoundError, ValidationError } from '../../shared/errors';
import { asyncHandler, createdResponse, okResponse } from '../../shared/utils';
import { uuidSchema } from '../../shared/validators';
import { recordAuditLog } from '../audit-logs/audit-log.service';

const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_ON_USER', 'RESOLVED', 'CLOSED'] as const;
const TICKET_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const SETTING_CATEGORIES = [
  'GENERAL',
  'LEAD_ROUTING',
  'PRIVACY_CONSENT',
  'BILLING',
  'SECURITY',
  'NOTIFICATIONS',
] as const;

const patchTicketSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  assignedAdminUserId: uuidSchema.nullable().optional(),
  resolutionNotes: z.string().trim().max(2000).nullable().optional(),
});

const createReplySchema = z.object({
  body: z.string().trim().min(2).max(4000),
  isInternalNote: z.boolean().default(false),
  nextStatus: z.enum(TICKET_STATUSES).optional(),
});

const putSettingsSchema = z.object({
  settings: z
    .array(
      z.object({
        key: z.string().trim().min(3).max(80).regex(/^[a-z0-9._-]+$/),
        category: z.enum(SETTING_CATEGORIES),
        value: z.union([z.string(), z.number(), z.boolean()]),
        description: z.string().trim().max(300).optional(),
      }),
    )
    .min(1)
    .max(30),
});

const FORBIDDEN_SETTING_KEY_PATTERN = /(secret|password|token|api_key|apikey|database_url|private_key)/i;
const idParam = z.object({ id: uuidSchema });

export function createAdminSupportAndSettingsRoutes(db: PrismaClient = prisma): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(db);

  // Support Tickets
  router.get(
    '/support',
    authenticate,
    authorizePermissions([PERMISSIONS.SUPPORT_MANAGE], db),
    asyncHandler(async (req, res) => {
      const q = String(req.query.q ?? '').trim();
      const status = String(req.query.status ?? '').trim();
      const priority = String(req.query.priority ?? '').trim();
      const assigned = String(req.query.assignedAdminUserId ?? '').trim();
      const page = Math.max(1, Number(req.query.page ?? '1') || 1);
      const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize ?? '15') || 15));

      const where: Prisma.SupportTicketWhereInput = {
        ...(status && (TICKET_STATUSES as readonly string[]).includes(status) ? { status } : {}),
        ...(priority && (TICKET_PRIORITIES as readonly string[]).includes(priority) ? { priority } : {}),
        ...(assigned === 'unassigned'
          ? { assignedAdminUserId: null }
          : assigned
            ? { assignedAdminUserId: assigned }
            : {}),
        ...(q
          ? {
              OR: [
                { ticketNumber: { contains: q.toUpperCase() } },
                { subject: { contains: q } },
                { description: { contains: q } },
                { requester: { fullName: { contains: q } } },
                { requester: { email: { contains: q.toLowerCase() } } },
              ],
            }
          : {}),
      };

      const [openCount, inProgressCount, criticalOpenCount, resolvedCount, total, tickets, admins] =
        await Promise.all([
          db.supportTicket.count({ where: { status: 'OPEN' } }),
          db.supportTicket.count({ where: { status: 'IN_PROGRESS' } }),
          db.supportTicket.count({
            where: { priority: 'CRITICAL', status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_ON_USER'] } },
          }),
          db.supportTicket.count({ where: { status: { in: ['RESOLVED', 'CLOSED'] } } }),
          db.supportTicket.count({ where }),
          db.supportTicket.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: {
              requester: { select: { id: true, fullName: true, email: true, role: true } },
              assignedAdmin: { select: { id: true, fullName: true, email: true, role: true } },
              lead: { select: { id: true, specialization: true, status: true } },
              _count: { select: { replies: true } },
            },
          }),
          db.user.findMany({
            where: { role: { in: [...ADMIN_ROLE_CODES] }, accountStatus: 'ACTIVE', deletedAt: null },
            orderBy: { fullName: 'asc' },
            select: { id: true, fullName: true, email: true, role: true },
          }),
        ]);

      return okResponse(res, {
        summary: { openCount, inProgressCount, criticalOpenCount, resolvedCount },
        tickets,
        admins,
        pagination: { page, pageSize, total },
      });
    }),
  );

  router.get(
    '/support/:id',
    authenticate,
    authorizePermissions([PERMISSIONS.SUPPORT_MANAGE], db),
    validateRequest({ params: idParam }),
    asyncHandler(async (req, res) => {
      const ticket = await db.supportTicket.findUnique({
        where: { id: String(req.params.id) },
        include: {
          requester: { select: { id: true, fullName: true, email: true, role: true } },
          assignedAdmin: { select: { id: true, fullName: true, email: true, role: true } },
          lead: { select: { id: true, specialization: true, status: true } },
          replies: {
            orderBy: { createdAt: 'asc' },
            include: { sender: { select: { id: true, fullName: true, email: true, role: true } } },
          },
        },
      });
      if (!ticket) throw new NotFoundError('TICKET_NOT_FOUND', 'Support ticket not found.');
      return okResponse(res, { ticket });
    }),
  );

  router.patch(
    '/support/:id',
    csrfProtection,
    authenticate,
    authorizePermissions([PERMISSIONS.SUPPORT_MANAGE], db),
    validateRequest({ params: idParam, body: patchTicketSchema }),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof patchTicketSchema>;
      const existing = await db.supportTicket.findUnique({ where: { id: String(req.params.id) } });
      if (!existing) throw new NotFoundError('TICKET_NOT_FOUND', 'Support ticket not found.');

      if (body.assignedAdminUserId) {
        const admin = await db.user.findUnique({
          where: { id: body.assignedAdminUserId },
          select: { role: true, accountStatus: true, deletedAt: true },
        });
        if (!admin || admin.deletedAt || admin.accountStatus !== 'ACTIVE' || !(ADMIN_ROLE_CODES as readonly string[]).includes(admin.role)) {
          throw new ValidationError('Assigned user must be an active administrator.');
        }
      }

      const now = new Date();
      const ticket = await db.$transaction(async (tx) => {
        const updated = await tx.supportTicket.update({
          where: { id: existing.id },
          data: {
            ...(body.status !== undefined ? { status: body.status } : {}),
            ...(body.priority !== undefined ? { priority: body.priority } : {}),
            ...(body.assignedAdminUserId !== undefined ? { assignedAdminUserId: body.assignedAdminUserId } : {}),
            ...(body.resolutionNotes !== undefined ? { resolutionNotes: body.resolutionNotes || null } : {}),
            ...(body.status === 'RESOLVED' ? { resolvedAt: existing.resolvedAt ?? now } : {}),
            ...(body.status === 'CLOSED' ? { closedAt: existing.closedAt ?? now } : {}),
          },
        });
        await recordAuditLog(
          {
            actorUserId: req.principal!.userId,
            actorRole: req.principal!.role,
            action: 'SUPPORT_TICKET_UPDATED',
            resourceType: 'SupportTicket',
            resourceId: existing.id,
          },
          tx,
        );
        return updated;
      });
      return okResponse(res, { ticket });
    }),
  );

  router.post(
    '/support/:id',
    csrfProtection,
    authenticate,
    authorizePermissions([PERMISSIONS.SUPPORT_MANAGE], db),
    validateRequest({ params: idParam, body: createReplySchema }),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof createReplySchema>;
      const existing = await db.supportTicket.findUnique({ where: { id: String(req.params.id) } });
      if (!existing) throw new NotFoundError('TICKET_NOT_FOUND', 'Support ticket not found.');

      const now = new Date();
      const reply = await db.$transaction(async (tx) => {
        const created = await tx.supportTicketReply.create({
          data: {
            ticketId: existing.id,
            senderUserId: req.principal!.userId,
            isInternalNote: body.isInternalNote,
            body: body.body,
          },
          include: { sender: { select: { id: true, fullName: true, email: true, role: true } } },
        });
        if (body.nextStatus && body.nextStatus !== existing.status) {
          await tx.supportTicket.update({
            where: { id: existing.id },
            data: {
              status: body.nextStatus,
              ...(body.nextStatus === 'RESOLVED' ? { resolvedAt: existing.resolvedAt ?? now } : {}),
              ...(body.nextStatus === 'CLOSED' ? { closedAt: existing.closedAt ?? now } : {}),
            },
          });
        }
        if (!body.isInternalNote && existing.requesterUserId !== req.principal!.userId) {
          await tx.notification.create({
            data: {
              recipientUserId: existing.requesterUserId,
              channel: 'IN_APP',
              templateKey: 'SUPPORT_TICKET_REPLY',
              title: `Update on Ticket ${existing.ticketNumber}`,
              body: body.body.slice(0, 240),
              status: 'SENT',
              sentAt: now,
              relatedEntityType: 'SupportTicket',
              relatedEntityId: existing.id,
            },
          });
        }
        await recordAuditLog(
          {
            actorUserId: req.principal!.userId,
            actorRole: req.principal!.role,
            action: body.isInternalNote ? 'SUPPORT_TICKET_INTERNAL_NOTE' : 'SUPPORT_TICKET_REPLIED',
            resourceType: 'SupportTicket',
            resourceId: existing.id,
          },
          tx,
        );
        return created;
      });
      return createdResponse(res, { reply });
    }),
  );

  // Settings
  router.get(
    '/settings',
    authenticate,
    authorizePermissions([PERMISSIONS.SETTINGS_MANAGE], db),
    asyncHandler(async (_req, res) => {
      const [persistedSettings, roles] = await Promise.all([
        db.platformSetting.findMany({ orderBy: [{ category: 'asc' }, { key: 'asc' }] }),
        db.adminRole.findMany({
          orderBy: { code: 'asc' },
          include: { permissions: { include: { permission: { select: { code: true } } } } },
        }),
      ]);

      const settings = persistedSettings.map((item) => {
        let value: unknown = item.valueJson;
        try {
          value = JSON.parse(item.valueJson);
        } catch {
          value = item.valueJson;
        }
        return {
          id: item.id,
          key: item.key,
          category: item.category,
          value,
          description: item.description,
          updatedByUserId: item.updatedByUserId,
          updatedAt: item.updatedAt,
        };
      });

      return okResponse(res, {
        settings,
        roles: roles.map((r) => ({
          id: r.id,
          code: r.code,
          name: r.name,
          description: r.description,
          isSystemRole: r.isSystemRole,
          isActive: r.isActive,
          permissions: r.permissions.map((p) => p.permission.code).sort(),
        })),
      });
    }),
  );

  router.put(
    '/settings',
    csrfProtection,
    authenticate,
    authorizePermissions([PERMISSIONS.SETTINGS_MANAGE], db),
    validateRequest({ body: putSettingsSchema }),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof putSettingsSchema>;
      for (const item of body.settings) {
        if (FORBIDDEN_SETTING_KEY_PATTERN.test(item.key)) {
          throw new ValidationError(
            `Setting key '${item.key}' cannot reference secrets or credentials.`,
          );
        }
      }

      const saved = await db.$transaction(async (tx) => {
        const list = [];
        for (const item of body.settings) {
          const rec = await tx.platformSetting.upsert({
            where: { key: item.key },
            create: {
              key: item.key,
              category: item.category,
              valueJson: JSON.stringify(item.value),
              description: item.description ?? null,
              updatedByUserId: req.principal!.userId,
            },
            update: {
              category: item.category,
              valueJson: JSON.stringify(item.value),
              ...(item.description !== undefined ? { description: item.description || null } : {}),
              updatedByUserId: req.principal!.userId,
            },
          });
          list.push(rec);
        }
        await recordAuditLog(
          {
            actorUserId: req.principal!.userId,
            actorRole: req.principal!.role,
            action: 'PLATFORM_SETTINGS_UPDATED',
            resourceType: 'PlatformSetting',
            metadata: { updatedKeys: list.map((s) => s.key) },
          },
          tx,
        );
        return list;
      });

      return okResponse(res, { updatedCount: saved.length, keys: saved.map((s) => s.key) });
    }),
  );

  // Activity Log feed
  router.get(
    '/activity',
    authenticate,
    authorizePermissions([PERMISSIONS.ANALYTICS_READ], db),
    asyncHandler(async (_req, res) => {
      const activities = await db.activityLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return okResponse(res, { activities });
    }),
  );

  return router;
}
