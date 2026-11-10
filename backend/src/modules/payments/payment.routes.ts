import type { Prisma, PrismaClient } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { createAuthenticateMiddleware } from '../../middleware/authenticate';
import { authorizePermissions } from '../../middleware/authorize';
import { csrfProtection } from '../../middleware/csrf-protection';
import { validateRequest } from '../../middleware/validate-request';
import { PERMISSIONS } from '../../security/permissions';
import { INVOICE_STATUSES, PAYMENT_STATUSES } from '../../shared/constants';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors';
import { asyncHandler, okResponse } from '../../shared/utils';
import { uuidSchema } from '../../shared/validators';
import { recordAuditLog } from '../audit-logs/audit-log.service';

const refundSchema = z.object({
  amountMinor: z.number().int().positive('Refund amount must be positive.'),
  reason: z.string().trim().min(5).max(500),
});

const idParam = z.object({ id: uuidSchema });

function parseDate(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const iso = trimmed.length === 10 ? `${trimmed}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z` : trimmed;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function createPaymentAdminRoutes(db: PrismaClient = prisma): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(db);

  router.get(
    '/',
    authenticate,
    authorizePermissions([PERMISSIONS.PAYMENTS_READ], db),
    asyncHandler(async (req, res) => {
      const q = String(req.query.q ?? '').trim();
      const status = String(req.query.status ?? '').trim();
      const invoiceStatus = String(req.query.invoiceStatus ?? '').trim();
      const fromDate = parseDate(req.query.from as string | undefined, false);
      const toDate = parseDate(req.query.to as string | undefined, true);
      const page = Math.max(1, Number(req.query.page ?? '1') || 1);
      const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize ?? '15') || 15));

      const dateRange =
        fromDate || toDate
          ? { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) }
          : undefined;

      const paymentWhere: Prisma.PaymentWhereInput = {
        ...(status && (PAYMENT_STATUSES as readonly string[]).includes(status) ? { status } : {}),
        ...(dateRange ? { createdAt: dateRange } : {}),
        ...(q
          ? {
              OR: [
                { gatewayPaymentId: { contains: q } },
                { gatewayProvider: { contains: q } },
                { invoice: { invoiceNumber: { contains: q.toUpperCase() } } },
                { doctor: { user: { fullName: { contains: q } } } },
                { doctor: { user: { email: { contains: q.toLowerCase() } } } },
                { hospital: { displayName: { contains: q } } },
                { hospital: { legalName: { contains: q } } },
                { hospital: { contactEmail: { contains: q.toLowerCase() } } },
              ],
            }
          : {}),
      };

      const invoiceWhere: Prisma.InvoiceWhereInput = {
        ...(invoiceStatus && (INVOICE_STATUSES as readonly string[]).includes(invoiceStatus)
          ? { status: invoiceStatus }
          : {}),
        ...(dateRange ? { createdAt: dateRange } : {}),
        ...(q
          ? {
              OR: [
                { invoiceNumber: { contains: q.toUpperCase() } },
                { doctor: { user: { fullName: { contains: q } } } },
                { doctor: { user: { email: { contains: q.toLowerCase() } } } },
                { hospital: { displayName: { contains: q } } },
                { hospital: { legalName: { contains: q } } },
                { hospital: { contactEmail: { contains: q.toLowerCase() } } },
              ],
            }
          : {}),
      };

      const [succeededAgg, refundedAgg, failedCount, openInvoicesCount, totalPayments, payments, invoices] =
        await Promise.all([
          db.payment.aggregate({
            where: {
              status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
              ...(dateRange ? { createdAt: dateRange } : {}),
            },
            _sum: { amountMinor: true },
          }),
          db.payment.aggregate({
            where: {
              status: { in: ['PARTIALLY_REFUNDED', 'REFUNDED'] },
              ...(dateRange ? { createdAt: dateRange } : {}),
            },
            _sum: { refundedMinor: true },
          }),
          db.payment.count({ where: { status: 'FAILED', ...(dateRange ? { createdAt: dateRange } : {}) } }),
          db.invoice.count({ where: { status: 'OPEN' } }),
          db.payment.count({ where: paymentWhere }),
          db.payment.findMany({
            where: paymentWhere,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: {
              subscription: {
                select: { id: true, plan: { select: { name: true, code: true, billingCycle: true } } },
              },
              invoice: { select: { id: true, invoiceNumber: true, status: true, totalMinor: true } },
              doctor: { select: { id: true, user: { select: { fullName: true, email: true } } } },
              hospital: { select: { id: true, displayName: true, legalName: true, contactEmail: true } },
            },
          }),
          db.invoice.findMany({
            where: invoiceWhere,
            orderBy: { createdAt: 'desc' },
            take: 25,
            include: {
              subscription: { select: { id: true, plan: { select: { name: true, code: true } } } },
              doctor: { select: { id: true, user: { select: { fullName: true, email: true } } } },
              hospital: { select: { id: true, displayName: true, legalName: true, contactEmail: true } },
            },
          }),
        ]);

      return okResponse(res, {
        summary: {
          succeededVolumeMinor: succeededAgg._sum.amountMinor ?? 0,
          refundedVolumeMinor: refundedAgg._sum.refundedMinor ?? 0,
          failedCount,
          openInvoicesCount,
        },
        payments,
        invoices,
        pagination: { page, pageSize, total: totalPayments },
      });
    }),
  );

  router.post(
    '/:id/refund',
    csrfProtection,
    authenticate,
    authorizePermissions([PERMISSIONS.PAYMENTS_REFUND], db),
    validateRequest({ params: idParam, body: refundSchema }),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof refundSchema>;
      const payment = await db.$transaction(async (tx) => {
        const current = await tx.payment.findUnique({ where: { id: String(req.params.id) } });
        if (!current) {
          throw new NotFoundError('PAYMENT_NOT_FOUND', 'Payment record not found.');
        }
        if (current.status !== 'SUCCEEDED' && current.status !== 'PARTIALLY_REFUNDED') {
          throw new ConflictError('PAYMENT_NOT_REFUNDABLE', `Payment in status '${current.status}' cannot be refunded.`);
        }
        const remaining = current.amountMinor - current.refundedMinor;
        if (remaining <= 0 || body.amountMinor > remaining) {
          throw new ValidationError(`Refund exceeds remaining balance (${remaining}).`);
        }

        const nextRefunded = current.refundedMinor + body.amountMinor;
        const nextStatus = nextRefunded >= current.amountMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

        const updated = await tx.payment.update({
          where: { id: current.id },
          data: { refundedMinor: nextRefunded, status: nextStatus },
        });

        await recordAuditLog(
          {
            actorUserId: req.principal!.userId,
            actorRole: req.principal!.role,
            action: 'PAYMENT_REFUNDED',
            resourceType: 'Payment',
            resourceId: current.id,
            metadata: { refundedIncrementMinor: body.amountMinor, nextStatus, reason: body.reason },
          },
          tx,
        );

        return updated;
      });

      return okResponse(res, { payment });
    }),
  );

  return router;
}
