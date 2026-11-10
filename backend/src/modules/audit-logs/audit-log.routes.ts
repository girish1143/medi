import type { Prisma, PrismaClient } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../../config/database';
import { createAuthenticateMiddleware } from '../../middleware/authenticate';
import { authorizePermissions } from '../../middleware/authorize';
import { PERMISSIONS } from '../../security/permissions';
import { AUDIT_OUTCOMES } from '../../shared/constants';
import { asyncHandler, okResponse } from '../../shared/utils';
import { sanitizeAuditMetadata } from './audit-log.service';

function parseDate(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const iso = trimmed.length === 10 ? `${trimmed}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z` : trimmed;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function safeParseMetadata(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return sanitizeAuditMetadata(JSON.parse(raw));
  } catch {
    return { raw: '[UNPARSEABLE_METADATA]' };
  }
}

export function createAuditLogAdminRoutes(db: PrismaClient = prisma): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(db);

  router.get(
    '/',
    authenticate,
    authorizePermissions([PERMISSIONS.AUDIT_LOGS_READ], db),
    asyncHandler(async (req, res) => {
      const q = String(req.query.q ?? '').trim();
      const outcome = String(req.query.outcome ?? '').trim();
      const resourceType = String(req.query.resourceType ?? '').trim();
      const actionPrefix = String(req.query.actionPrefix ?? '').trim();
      const fromDate = parseDate(req.query.from as string | undefined, false);
      const toDate = parseDate(req.query.to as string | undefined, true);
      const page = Math.max(1, Number(req.query.page ?? '1') || 1);
      const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize ?? '20') || 20));

      const dateRange =
        fromDate || toDate
          ? { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) }
          : undefined;

      const where: Prisma.AuditLogWhereInput = {
        ...(outcome && (AUDIT_OUTCOMES as readonly string[]).includes(outcome) ? { outcome } : {}),
        ...(resourceType ? { resourceType } : {}),
        ...(actionPrefix ? { action: { startsWith: actionPrefix } } : {}),
        ...(dateRange ? { createdAt: dateRange } : {}),
        ...(q
          ? {
              OR: [
                { action: { contains: q.toUpperCase() } },
                { resourceType: { contains: q } },
                { resourceId: { contains: q } },
                { actor: { fullName: { contains: q } } },
                { actor: { email: { contains: q.toLowerCase() } } },
              ],
            }
          : {}),
      };

      const [totalAll, deniedCount, failureCount, authEventsCount, total, rawLogs] = await Promise.all([
        db.auditLog.count(),
        db.auditLog.count({ where: { outcome: 'DENIED' } }),
        db.auditLog.count({ where: { outcome: 'FAILURE' } }),
        db.auditLog.count({
          where: {
            OR: [
              { action: { startsWith: 'AUTH_' } },
              { action: { startsWith: 'RBAC_' } },
              { action: { startsWith: 'USER_' } },
            ],
          },
        }),
        db.auditLog.count({ where }),
        db.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            actorUserId: true,
            actorRole: true,
            action: true,
            resourceType: true,
            resourceId: true,
            outcome: true,
            requestId: true,
            ipHash: true,
            metadataJson: true,
            createdAt: true,
            actor: { select: { id: true, fullName: true, email: true, role: true } },
          },
        }),
      ]);

      const logs = rawLogs.map((log) => ({
        id: log.id,
        actorUserId: log.actorUserId,
        actorRole: log.actorRole,
        actor: log.actor,
        action: log.action,
        resourceType: log.resourceType,
        resourceId: log.resourceId,
        outcome: log.outcome,
        requestId: log.requestId,
        hasIpHash: Boolean(log.ipHash),
        metadata: safeParseMetadata(log.metadataJson),
        createdAt: log.createdAt,
      }));

      return okResponse(res, {
        summary: { totalAll, deniedCount, failureCount, authEventsCount },
        logs,
        pagination: { page, pageSize, total },
      });
    }),
  );

  return router;
}
