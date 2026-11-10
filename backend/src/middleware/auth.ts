import type { SupabaseClient } from '@supabase/supabase-js';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import {
  isAdminRole,
  type AccountStatus,
  type AdminScope,
  type AppRole,
} from '../types/domain.js';
import type { AuthContext, RequestWithContext } from '../types/api.js';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';

export interface ResolvedAuthIdentity {
  userId: string;
  email: string;
  role: AppRole;
  accountStatus: AccountStatus;
  adminScope: AdminScope | null;
}

export type AuthTokenResolver = (accessToken: string) => Promise<ResolvedAuthIdentity | null>;

interface UserRow {
  id: string;
  email: string;
  primary_role: AppRole;
  account_status: AccountStatus;
}

interface AdminRoleRow {
  admin_scope: AdminScope;
  expires_at: string | null;
}

/**
 * Resolves a Supabase JWT against Supabase Auth and authoritative database state
 * (public.users + public.admin_roles) so suspensions or revocations take effect immediately.
 */
export function createSupabaseAuthResolver(supabaseAdmin: SupabaseClient): AuthTokenResolver {
  return async (accessToken: string): Promise<ResolvedAuthIdentity | null> => {
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
    if (authError || !authData.user) {
      return null;
    }

    const { data: userRow, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, email, primary_role, account_status')
      .eq('id', authData.user.id)
      .maybeSingle<UserRow>();

    if (userError || !userRow) {
      return null;
    }

    let adminScope: AdminScope | null = null;
    if (isAdminRole(userRow.primary_role)) {
      const { data: adminRoleRow, error: adminRoleError } = await supabaseAdmin
        .from('admin_roles')
        .select('admin_scope, expires_at')
        .eq('user_id', userRow.id)
        .eq('admin_scope', userRow.primary_role)
        .is('revoked_at', null)
        .maybeSingle<AdminRoleRow>();

      if (adminRoleError || !adminRoleRow) {
        return {
          userId: userRow.id,
          email: userRow.email,
          role: userRow.primary_role,
          accountStatus: userRow.account_status,
          adminScope: null,
        };
      }

      const isExpired =
        adminRoleRow.expires_at !== null &&
        new Date(adminRoleRow.expires_at).getTime() <= Date.now();
      adminScope = isExpired ? null : adminRoleRow.admin_scope;
    }

    return {
      userId: userRow.id,
      email: userRow.email,
      role: userRow.primary_role,
      accountStatus: userRow.account_status,
      adminScope,
    };
  };
}

function extractBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) {
    return null;
  }
  const parts = authorizationHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer' || !parts[1]) {
    return null;
  }
  return parts[1];
}

/**
 * Verifies the Bearer JWT and enforces active account status & dual-lock admin status.
 */
export function createAuthMiddleware(resolveToken: AuthTokenResolver): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = extractBearerToken(req.header('authorization'));
      if (!token) {
        throw new UnauthorizedError('Missing or malformed Bearer authorization token.');
      }

      const identity = await resolveToken(token);
      if (!identity) {
        throw new UnauthorizedError('Invalid or expired authentication token.');
      }

      if (identity.accountStatus !== 'active') {
        throw new ForbiddenError(
          'ACCOUNT_INACTIVE',
          `Account is currently '${identity.accountStatus}' and cannot access this resource.`,
        );
      }

      if (isAdminRole(identity.role) && identity.adminScope !== identity.role) {
        throw new ForbiddenError(
          'FORBIDDEN_ROLE',
          'Administrative privilege is missing, revoked, or expired.',
        );
      }

      const authContext: AuthContext = {
        userId: identity.userId,
        email: identity.email,
        role: identity.role,
        accountStatus: identity.accountStatus,
        adminScope: identity.adminScope,
        accessToken: token,
      };

      (req as RequestWithContext).auth = authContext;
      next();
    } catch (error) {
      next(error);
    }
  };
}
