import type { PrismaClient } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/database';
import { recordAuditLog } from '../modules/audit-logs/audit-log.service';
import { hashRequestFingerprint } from '../security/token-hash';
import { isAdminRole } from '../shared/constants';
import { ForbiddenError, UnauthorizedError } from '../shared/errors';

export function requireSelfOrAdminPermission(
  paramKey: string,
  requiredAdminPermission: string,
  db: PrismaClient = prisma,
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const principal = req.principal;
      if (!principal) {
        throw new UnauthorizedError();
      }

      const targetUserId = String(req.params[paramKey] ?? '');
      if (targetUserId && principal.userId === targetUserId) {
        next();
        return;
      }

      if (isAdminRole(principal.role) && principal.permissions.includes(requiredAdminPermission)) {
        next();
        return;
      }

      await recordAuditLog(
        {
          actorUserId: principal.userId,
          actorRole: principal.role,
          action: 'ABAC_OWNERSHIP_DENIED',
          resourceType: 'UserResource',
          resourceId: targetUserId || null,
          outcome: 'DENIED',
          requestId: res.locals.requestId as string | undefined,
          ipHash: hashRequestFingerprint(req.ip),
          userAgentHash: hashRequestFingerprint(req.header('user-agent')),
        },
        db,
      );

      throw new ForbiddenError(
        'FORBIDDEN_RESOURCE_OWNERSHIP',
        'You are not authorized to access another user resource.',
      );
    } catch (err) {
      next(err);
    }
  };
}
