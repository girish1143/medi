import type { Prisma, PrismaClient } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { createAuthenticateMiddleware } from '../../middleware/authenticate';
import { authorizePermissions, authorizeRoles } from '../../middleware/authorize';
import { csrfProtection } from '../../middleware/csrf-protection';
import { validateRequest } from '../../middleware/validate-request';
import { PERMISSIONS } from '../../security/permissions';
import { ADMIN_ROLE_CODES } from '../../shared/constants';
import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors';
import { asyncHandler, createdResponse, okResponse } from '../../shared/utils';
import { uuidSchema } from '../../shared/validators';
import { recordAuditLog } from '../audit-logs/audit-log.service';

const markReadSchema = z.object({
  id: uuidSchema.optional(),
  markAllRead: z.boolean().optional(),
});

const createNotificationSchema = z.object({
  recipientUserId: uuidSchema,
  channel: z.enum(['IN_APP', 'EMAIL', 'SMS', 'PUSH']),
  templateKey: z.string().trim().min(2).max(80),
  title: z.string().trim().min(2).max(160),
  body: z.string().trim().min(2).max(2000),
  relatedEntityType: z.string().trim().max(60).optional(),
  relatedEntityId: z.string().trim().max(80).optional(),
});

function externalTransportStatus() {
  return {
    emailConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM),
    smsConfigured: Boolean(process.env.SMS_WEBHOOK_URL),
    pushConfigured: Boolean(process.env.PUSH_WEBHOOK_URL),
  };
}

export function createNotificationAdminRoutes(db: PrismaClient = prisma): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(db);

  router.get(
    '/',
    authenticate,
    authorizeRoles(ADMIN_ROLE_CODES, db),
    asyncHandler(async (req, res) => {
      const principal = req.principal!;
      const canManageDispatch = principal.permissions.includes(PERMISSIONS.SETTINGS_MANAGE);
      const limitParam = req.query.limit;

      if (limitParam) {
        const limit = Math.min(20, Math.max(1, Number(limitParam) || 5));
        const [notifications, unreadCount] = await Promise.all([
          db.notification.findMany({
            where: { recipientUserId: principal.userId },
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: {
              id: true,
              title: true,
              body: true,
              channel: true,
              status: true,
              createdAt: true,
              readAt: true,
            },
          }),
          db.notification.count({ where: { recipientUserId: principal.userId, readAt: null } }),
        ]);
        return okResponse(res, { notifications, unreadCount });
      }

      const scope = req.query.scope === 'all' ? 'all' : 'mine';
      if (scope === 'all' && !canManageDispatch) {
        throw new ForbiddenError('FORBIDDEN_PERMISSION', 'Viewing platform dispatch queue requires settings.manage permission.');
      }

      const q = String(req.query.q ?? '').trim();
      const channel = String(req.query.channel ?? '').trim();
      const status = String(req.query.status ?? '').trim();
      const page = Math.max(1, Number(req.query.page ?? '1') || 1);
      const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize ?? '15') || 15));

      const where: Prisma.NotificationWhereInput = {
        ...(scope === 'mine' ? { recipientUserId: principal.userId } : {}),
        ...(channel ? { channel } : {}),
        ...(status ? { status } : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q } },
                { body: { contains: q } },
                { templateKey: { contains: q } },
                { recipient: { email: { contains: q.toLowerCase() } } },
              ],
            }
          : {}),
      };

      const [total, unreadCount, notifications, recipients] = await Promise.all([
        db.notification.count({ where }),
        db.notification.count({ where: { recipientUserId: principal.userId, readAt: null } }),
        db.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            recipient: { select: { id: true, fullName: true, email: true, role: true } },
          },
        }),
        canManageDispatch
          ? db.user.findMany({
              where: { deletedAt: null },
              orderBy: { createdAt: 'desc' },
              take: 100,
              select: { id: true, fullName: true, email: true, role: true },
            })
          : Promise.resolve([]),
      ]);

      return okResponse(res, {
        notifications,
        unreadCount,
        canManageDispatch,
        transportStatus: externalTransportStatus(),
        recipients,
        pagination: { page, pageSize, total },
      });
    }),
  );

  router.patch(
    '/',
    csrfProtection,
    authenticate,
    authorizeRoles(ADMIN_ROLE_CODES, db),
    validateRequest({ body: markReadSchema }),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof markReadSchema>;
      const now = new Date();
      if (body.markAllRead) {
        const updated = await db.notification.updateMany({
          where: { recipientUserId: req.principal!.userId, readAt: null },
          data: { readAt: now, status: 'READ' },
        });
        return okResponse(res, { updatedCount: updated.count });
      }
      if (!body.id) {
        throw new ValidationError('Provide id or markAllRead.');
      }
      const existing = await db.notification.findUnique({ where: { id: body.id } });
      if (!existing || existing.recipientUserId !== req.principal!.userId) {
        throw new NotFoundError('NOTIFICATION_NOT_FOUND', 'Notification not found in inbox.');
      }
      const notification = await db.notification.update({
        where: { id: existing.id },
        data: { readAt: now, status: 'READ' },
      });
      return okResponse(res, { notification });
    }),
  );

  router.post(
    '/',
    csrfProtection,
    authenticate,
    authorizePermissions([PERMISSIONS.SETTINGS_MANAGE], db),
    validateRequest({ body: createNotificationSchema }),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof createNotificationSchema>;
      const recipient = await db.user.findUnique({
        where: { id: body.recipientUserId },
        select: { id: true, deletedAt: true },
      });
      if (!recipient || recipient.deletedAt) {
        throw new NotFoundError('RECIPIENT_NOT_FOUND', 'Recipient user not found.');
      }

      const isDirect = body.channel === 'IN_APP';
      const now = new Date();

      const notification = await db.$transaction(async (tx) => {
        const created = await tx.notification.create({
          data: {
            recipientUserId: recipient.id,
            channel: body.channel,
            templateKey: body.templateKey,
            title: body.title,
            body: body.body,
            status: isDirect ? 'SENT' : 'QUEUED',
            sentAt: isDirect ? now : null,
            relatedEntityType: body.relatedEntityType ?? null,
            relatedEntityId: body.relatedEntityId ?? null,
          },
          include: { recipient: { select: { id: true, fullName: true, email: true, role: true } } },
        });
        await recordAuditLog(
          {
            actorUserId: req.principal!.userId,
            actorRole: req.principal!.role,
            action: 'NOTIFICATION_DISPATCH_CREATED',
            resourceType: 'Notification',
            resourceId: created.id,
          },
          tx,
        );
        return created;
      });

      return createdResponse(res, {
        notification,
        transportStatus: externalTransportStatus(),
      });
    }),
  );

  return router;
}
