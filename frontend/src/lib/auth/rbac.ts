import { prisma } from '../db/prisma';
import { isAdminUserRole, type UserRole } from '../domain/enums';
import { recordAuditLog } from '../services/audit.service';
import { auth } from './auth';

export class AuthorizationError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'AuthorizationError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export interface VerifiedActor {
  userId: string;
  email: string;
  role: UserRole;
  adminRoleId: string | null;
}

/**
 * Loads the authenticated user from Auth.js session and re-verifies current
 * database status (accountStatus, deletedAt, and AdminRole active flag).
 */
export async function requireAuthenticatedActor(): Promise<VerifiedActor> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new AuthorizationError(401, 'UNAUTHORIZED', 'Authentication required.');
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      role: true,
      accountStatus: true,
      adminRoleId: true,
      deletedAt: true,
      adminRole: {
        select: {
          code: true,
          isActive: true,
        },
      },
    },
  });

  if (!dbUser || dbUser.deletedAt !== null || dbUser.accountStatus !== 'ACTIVE') {
    throw new AuthorizationError(403, 'ACCOUNT_INACTIVE', 'User account is not active.');
  }

  if (isAdminUserRole(dbUser.role)) {
    if (
      !dbUser.adminRoleId ||
      !dbUser.adminRole ||
      !dbUser.adminRole.isActive ||
      dbUser.adminRole.code !== dbUser.role
    ) {
      throw new AuthorizationError(
        403,
        'ADMIN_ROLE_INACTIVE',
        'Administrative role assignment is missing or inactive.',
      );
    }
  }

  return {
    userId: dbUser.id,
    email: dbUser.email,
    role: dbUser.role as UserRole,
    adminRoleId: dbUser.adminRoleId,
  };
}

/**
 * Verifies the caller holds one of the permitted roles on the server.
 */
export async function requireRole(allowedRoles: readonly UserRole[]): Promise<VerifiedActor> {
  const actor = await requireAuthenticatedActor();
  if (!allowedRoles.includes(actor.role)) {
    await recordAuditLog({
      actorUserId: actor.userId,
      actorRole: actor.role,
      action: 'RBAC_ROLE_DENIED',
      resourceType: 'RouteAccess',
      outcome: 'DENIED',
      metadata: { requiredRoles: allowedRoles },
    });
    throw new AuthorizationError(403, 'FORBIDDEN_ROLE', 'Insufficient role privilege.');
  }
  return actor;
}

/**
 * Verifies that an admin caller holds an explicit AdminPermission via AdminRolePermission.
 */
export async function requireAdminPermission(permissionCode: string): Promise<VerifiedActor> {
  const actor = await requireAuthenticatedActor();
  if (!isAdminUserRole(actor.role) || !actor.adminRoleId) {
    throw new AuthorizationError(403, 'FORBIDDEN_ADMIN', 'Administrative privileges required.');
  }

  const grant = await prisma.adminRolePermission.findFirst({
    where: {
      adminRoleId: actor.adminRoleId,
      permission: { code: permissionCode },
      adminRole: { isActive: true },
    },
    select: { id: true },
  });

  if (!grant) {
    await recordAuditLog({
      actorUserId: actor.userId,
      actorRole: actor.role,
      action: 'RBAC_PERMISSION_DENIED',
      resourceType: 'AdminPermission',
      outcome: 'DENIED',
      metadata: { permissionCode },
    });
    throw new AuthorizationError(
      403,
      'FORBIDDEN_PERMISSION',
      `Missing administrative permission '${permissionCode}'.`,
    );
  }

  return actor;
}
