import type { PrismaClient } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/database';
import { SECURITY_CONSTANTS } from '../config/security';
import { verifyAccessToken } from '../security/jwt';
import { type AccountStatus, isAdminRole, type UserRole } from '../shared/constants';
import { UnauthorizedError } from '../shared/errors';

export function extractAccessToken(req: Request): string | null {
  const cookieToken = req.cookies?.[SECURITY_CONSTANTS.ACCESS_COOKIE_NAME] as string | undefined;
  if (cookieToken && cookieToken.trim().length > 0) {
    return cookieToken.trim();
  }

  const authHeader = req.header('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token.length > 0) {
      return token;
    }
  }

  return null;
}

export function createAuthenticateMiddleware(db: PrismaClient = prisma) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = extractAccessToken(req);
      if (!token) {
        throw new UnauthorizedError('UNAUTHORIZED', 'Authentication credentials required.');
      }

      const claims = verifyAccessToken(token);

      const [user, session] = await Promise.all([
        db.user.findUnique({
          where: { id: claims.sub },
          select: {
            id: true,
            email: true,
            role: true,
            accountStatus: true,
            adminRoleId: true,
            sessionVersion: true,
            emailVerified: true,
            deletedAt: true,
            adminRole: {
              select: {
                isActive: true,
                permissions: {
                  select: { permission: { select: { code: true } } },
                },
              },
            },
          },
        }),
        db.session.findUnique({
          where: { id: claims.sid },
          select: { id: true, userId: true, expires: true, revokedAt: true },
        }),
      ]);

      if (!user || user.deletedAt !== null || !user.emailVerified) {
        throw new UnauthorizedError('UNAUTHORIZED', 'Account does not exist or is unverified.');
      }

      if (user.accountStatus !== 'ACTIVE') {
        throw new UnauthorizedError(
          'ACCOUNT_INACTIVE',
          `Account status '${user.accountStatus}' cannot access protected APIs.`,
        );
      }

      if (user.sessionVersion !== claims.ver) {
        throw new UnauthorizedError('SESSION_REVOKED', 'Session has been invalidated.');
      }

      if (
        !session ||
        session.userId !== user.id ||
        session.revokedAt !== null ||
        session.expires.getTime() <= Date.now()
      ) {
        throw new UnauthorizedError('SESSION_EXPIRED', 'Session is expired or revoked.');
      }

      if (isAdminRole(user.role)) {
        if (!user.adminRoleId || !user.adminRole?.isActive) {
          throw new UnauthorizedError('ADMIN_ROLE_INACTIVE', 'Administrative role is inactive.');
        }
      }

      const permissions =
        isAdminRole(user.role) && user.adminRole
          ? user.adminRole.permissions.map((rp) => rp.permission.code)
          : [];

      req.principal = {
        userId: user.id,
        email: user.email,
        role: user.role as UserRole,
        accountStatus: user.accountStatus as AccountStatus,
        adminRoleId: user.adminRoleId,
        sessionId: session.id,
        sessionVersion: user.sessionVersion,
        permissions,
      };

      next();
    } catch (err) {
      next(err);
    }
  };
}
