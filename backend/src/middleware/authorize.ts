import type { PrismaClient } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/database';
import { recordAuditLog } from '../modules/audit-logs/audit-log.service';
import { hashRequestFingerprint } from '../security/token-hash';
import type { UserRole } from '../shared/constants';
import { ForbiddenError, UnauthorizedError } from '../shared/errors';

export function authorizeRoles(allowedRoles: readonly UserRole[], db: PrismaClient = prisma) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const principal = req.principal;
      if (!principal) {
        throw new UnauthorizedError();
      }

      if (!allowedRoles.includes(principal.role)) {
        await recordAuditLog(
          {
            actorUserId: principal.userId,
            actorRole: principal.role,
            action: 'RBAC_ROLE_DENIED',
            resourceType: 'RouteAccess',
            outcome: 'DENIED',
            requestId: res.locals.requestId as string | undefined,
            ipHash: hashRequestFingerprint(req.ip),
            userAgentHash: hashRequestFingerprint(req.header('user-agent')),
            metadata: { requiredRoles: allowedRoles, path: req.path },
          },
          db,
        );
        throw new ForbiddenError('FORBIDDEN_ROLE', 'Insufficient role privilege.');
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

export function authorizePermissions(
  requiredPermissions: readonly string[],
  db: PrismaClient = prisma,
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const principal = req.principal;
      if (!principal) {
        throw new UnauthorizedError();
      }

      const granted = new Set(principal.permissions);
      const missing = requiredPermissions.filter((perm) => !granted.has(perm));

      if (missing.length > 0) {
        await recordAuditLog(
          {
            actorUserId: principal.userId,
            actorRole: principal.role,
            action: 'RBAC_PERMISSION_DENIED',
            resourceType: 'AdminPermission',
            outcome: 'DENIED',
            requestId: res.locals.requestId as string | undefined,
            ipHash: hashRequestFingerprint(req.ip),
            userAgentHash: hashRequestFingerprint(req.header('user-agent')),
            metadata: { missingPermissions: missing, path: req.path },
          },
          db,
        );
        throw new ForbiddenError(
          'FORBIDDEN_PERMISSION',
          `Missing required permission: ${missing.join(', ')}.`,
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
