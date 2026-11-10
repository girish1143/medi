import type { PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database';
import { hashPassword } from '../../security/password';
import { ensureRbacCatalog } from '../../security/permissions';
import type { AccountStatus } from '../../shared/constants';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../shared/errors';
import type { RequestAuditContext } from '../../shared/interfaces';
import { buildPaginationMeta } from '../../shared/utils';
import { recordAuditLog } from '../audit-logs/audit-log.service';
import { SessionRepository } from '../sessions/session.repository';
import { UserRepository } from './user.repository';
import {
  createAdminUserBodySchema,
  listUsersQuerySchema,
  updateUserBodySchema,
  updateUserStatusBodySchema,
} from './user.validation';

export class UserService {
  private readonly repo: UserRepository;
  private readonly sessionRepo: SessionRepository;

  constructor(private readonly db: PrismaClient = prisma) {
    this.repo = new UserRepository(db);
    this.sessionRepo = new SessionRepository(db);
  }

  async listUsers(rawQuery: unknown) {
    const query = listUsersQuerySchema.parse(rawQuery);
    const skip = (query.page - 1) * query.pageSize;
    const { total, items } = await this.repo.listUsers({
      q: query.q,
      role: query.role,
      status: query.status,
      skip,
      take: query.pageSize,
    });
    return {
      users: items,
      pagination: buildPaginationMeta(query.page, query.pageSize, total),
    };
  }

  async getUserById(targetUserId: string) {
    const user = await this.repo.findByIdSafe(targetUserId);
    if (!user || user.deletedAt !== null) {
      throw new NotFoundError('USER_NOT_FOUND', 'User account not found.');
    }
    return user;
  }

  async createAdminUser(
    actor: { userId: string; role: string },
    input: unknown,
    ctx: RequestAuditContext = {},
  ) {
    if (actor.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('FORBIDDEN_ROLE', 'Only SUPER_ADMIN may provision admin users.');
    }

    const data = createAdminUserBodySchema.parse(input);
    const existing = await this.db.user.findFirst({
      where: {
        OR: [{ email: data.email }, ...(data.phone ? [{ phone: data.phone }] : [])],
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictError('ACCOUNT_EXISTS', 'An account with this email or phone already exists.');
    }

    const passwordHash = await hashPassword(data.password);
    const now = new Date();

    return this.db.$transaction(async (tx) => {
      await ensureRbacCatalog(tx);

      const adminRole = await tx.adminRole.findUnique({
        where: { code: data.roleCode },
        select: { id: true, isActive: true },
      });
      if (!adminRole || !adminRole.isActive) {
        throw new NotFoundError('ADMIN_ROLE_NOT_FOUND', `Role '${data.roleCode}' is not active.`);
      }

      const created = await tx.user.create({
        data: {
          email: data.email,
          phone: data.phone ?? null,
          fullName: data.fullName,
          passwordHash,
          role: data.roleCode,
          accountStatus: 'ACTIVE',
          adminRoleId: adminRole.id,
          emailVerified: now,
          termsAcceptedAt: now,
        },
        select: {
          id: true,
          email: true,
          phone: true,
          fullName: true,
          role: true,
          accountStatus: true,
          createdAt: true,
        },
      });

      await tx.admin.create({
        data: {
          userId: created.id,
          employeeCode: `ADM-${created.id.slice(0, 8).toUpperCase()}`,
          department: data.roleCode,
        },
      });

      await recordAuditLog(
        {
          actorUserId: actor.userId,
          actorRole: actor.role,
          action: 'ADMIN_USER_PROVISIONED',
          resourceType: 'User',
          resourceId: created.id,
          requestId: ctx.requestId,
          ipHash: ctx.ipHash,
          userAgentHash: ctx.userAgentHash,
          metadata: { provisionedRole: created.role },
        },
        tx,
      );

      return created;
    });
  }

  async updateUserProfile(
    actor: { userId: string; role: string },
    targetUserId: string,
    input: unknown,
    ctx: RequestAuditContext = {},
  ) {
    const data = updateUserBodySchema.parse(input);
    const target = await this.repo.findByIdSafe(targetUserId);
    if (!target || target.deletedAt !== null) {
      throw new NotFoundError('USER_NOT_FOUND', 'User account not found.');
    }

    if (target.role === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError(
        'SUPER_ADMIN_PROTECTED',
        'Non-Super Admin administrators cannot modify Super Admin accounts.',
      );
    }

    const updated = await this.db.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: target.id },
        data: {
          ...(data.fullName !== undefined ? { fullName: data.fullName } : {}),
          ...(data.phone !== undefined ? { phone: data.phone } : {}),
        },
        select: {
          id: true,
          email: true,
          phone: true,
          fullName: true,
          role: true,
          accountStatus: true,
          updatedAt: true,
        },
      });

      await recordAuditLog(
        {
          actorUserId: actor.userId,
          actorRole: actor.role,
          action: 'USER_PROFILE_UPDATED',
          resourceType: 'User',
          resourceId: user.id,
          requestId: ctx.requestId,
          ipHash: ctx.ipHash,
          userAgentHash: ctx.userAgentHash,
        },
        tx,
      );

      return user;
    });

    return updated;
  }

  async updateUserStatus(
    actor: { userId: string; role: string },
    targetUserId: string,
    input: unknown,
    ctx: RequestAuditContext = {},
  ) {
    const data = updateUserStatusBodySchema.parse(input);
    if (actor.userId === targetUserId) {
      throw new ForbiddenError('SELF_STATUS_MUTATION_BLOCKED', 'Administrators cannot alter their own account status.');
    }

    const target = await this.repo.findByIdSafe(targetUserId);
    if (!target || target.deletedAt !== null) {
      throw new NotFoundError('USER_NOT_FOUND', 'User account not found.');
    }

    if (target.role === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError(
        'SUPER_ADMIN_PROTECTED',
        'Non-Super Admin administrators cannot suspend or modify Super Admin accounts.',
      );
    }

    const shouldRevokeSessions = data.status !== 'ACTIVE';

    return this.db.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: target.id },
        data: {
          accountStatus: data.status as AccountStatus,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          accountStatus: true,
        },
      });

      if (shouldRevokeSessions) {
        await this.sessionRepo.revokeAllForUser(target.id, tx);
      }

      await recordAuditLog(
        {
          actorUserId: actor.userId,
          actorRole: actor.role,
          action: `USER_STATUS_${data.status}`,
          resourceType: 'User',
          resourceId: target.id,
          requestId: ctx.requestId,
          ipHash: ctx.ipHash,
          userAgentHash: ctx.userAgentHash,
          metadata: {
            previousStatus: target.accountStatus,
            nextStatus: data.status,
            reason: data.reason,
          },
        },
        tx,
      );

      return updated;
    });
  }

  async softDeleteUser(
    actor: { userId: string; role: string },
    targetUserId: string,
    ctx: RequestAuditContext = {},
  ) {
    if (actor.userId === targetUserId) {
      throw new ForbiddenError('SELF_DELETE_BLOCKED', 'Administrators cannot delete their own account.');
    }
    const target = await this.repo.findByIdSafe(targetUserId);
    if (!target || target.deletedAt !== null) {
      throw new NotFoundError('USER_NOT_FOUND', 'User account not found.');
    }
    if (target.role === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('SUPER_ADMIN_PROTECTED', 'Only SUPER_ADMIN may deactivate a SUPER_ADMIN account.');
    }

    await this.db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: target.id },
        data: { accountStatus: 'DEACTIVATED', deletedAt: new Date() },
      });
      await this.sessionRepo.revokeAllForUser(target.id, tx);
      await recordAuditLog(
        {
          actorUserId: actor.userId,
          actorRole: actor.role,
          action: 'USER_SOFT_DELETED',
          resourceType: 'User',
          resourceId: target.id,
          requestId: ctx.requestId,
          ipHash: ctx.ipHash,
          userAgentHash: ctx.userAgentHash,
        },
        tx,
      );
    });

    return { deleted: true, userId: target.id };
  }
}
