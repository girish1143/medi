import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { isAdminRole, type AdminScope, type AppRole } from '../types/domain.js';
import type { RequestWithContext } from '../types/api.js';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';

/**
 * Enforces that the authenticated caller holds one of the permitted platform roles.
 * For admin roles, verifies dual-lock adminScope consistency.
 */
export function requireRoles(...allowedRoles: AppRole[]): RequestHandler {
  const allowedSet = new Set<AppRole>(allowedRoles);

  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const { auth } = req as RequestWithContext;
      if (!auth) {
        throw new UnauthorizedError();
      }

      if (!allowedSet.has(auth.role)) {
        throw new ForbiddenError(
          'FORBIDDEN_ROLE',
          'Caller role is not authorized to perform this operation.',
        );
      }

      if (isAdminRole(auth.role) && auth.adminScope !== auth.role) {
        throw new ForbiddenError(
          'FORBIDDEN_ROLE',
          'Active administrative scope assignment is required.',
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Enforces that the caller holds a specific active administrative scope (or super_admin).
 */
export function requireAdminScope(...allowedScopes: AdminScope[]): RequestHandler {
  const scopeSet = new Set<AdminScope>(allowedScopes);

  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const { auth } = req as RequestWithContext;
      if (!auth) {
        throw new UnauthorizedError();
      }

      if (!auth.adminScope || !scopeSet.has(auth.adminScope)) {
        throw new ForbiddenError(
          'FORBIDDEN_ROLE',
          'Required administrative scope is missing or inactive.',
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
