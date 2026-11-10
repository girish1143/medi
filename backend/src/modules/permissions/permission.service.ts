import type { PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database';
import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors';
import type { RequestAuditContext } from '../../shared/interfaces';
import { recordAuditLog } from '../audit-logs/audit-log.service';
import { PermissionRepository } from './permission.repository';

export class PermissionService {
  private readonly repo: PermissionRepository;

  constructor(private readonly db: PrismaClient = prisma) {
    this.repo = new PermissionRepository(db);
  }

  async listPermissions() {
    return this.repo.listPermissions();
  }

  async listRoles() {
    const roles = await this.repo.listRolesWithPermissions();
    return roles.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      isSystemRole: role.isSystemRole,
      isActive: role.isActive,
      permissions: role.permissions.map((rp) => rp.permission.code).sort(),
    }));
  }

  async getRolePermissions(roleCode: string) {
    const normalized = roleCode.trim().toUpperCase();
    const role = await this.repo.findRoleByCode(normalized);
    if (!role) {
      throw new NotFoundError('ROLE_NOT_FOUND', `Role '${normalized}' does not exist.`);
    }
    return {
      role: role.code,
      name: role.name,
      permissions: role.permissions.map((rp) => rp.permission.code).sort(),
    };
  }

  async updateRolePermissions(
    params: {
      actorUserId: string;
      actorRole: string;
      targetRoleCode: string;
      permissionCodes: string[];
    },
    ctx: RequestAuditContext = {},
  ) {
    const normalized = params.targetRoleCode.trim().toUpperCase();
    if (normalized === 'SUPER_ADMIN') {
      throw new ForbiddenError(
        'SUPER_ADMIN_IMMUTABLE',
        'SUPER_ADMIN full permission baseline cannot be narrowed or altered via API.',
      );
    }

    const role = await this.repo.findRoleByCode(normalized);
    if (!role) {
      throw new NotFoundError('ROLE_NOT_FOUND', `Role '${normalized}' does not exist.`);
    }

    const allPermissions = await this.repo.listPermissions();
    const validSet = new Set(allPermissions.map((p) => p.code));
    const uniqueCodes = Array.from(new Set(params.permissionCodes));
    const invalid = uniqueCodes.filter((code) => !validSet.has(code));
    if (invalid.length > 0) {
      throw new ValidationError(`Unknown permission code(s): ${invalid.join(', ')}`);
    }

    const updatedCodes = await this.repo.replaceRolePermissions(role.id, uniqueCodes);

    await recordAuditLog(
      {
        actorUserId: params.actorUserId,
        actorRole: params.actorRole,
        action: 'ROLE_PERMISSIONS_UPDATED',
        resourceType: 'AdminRole',
        resourceId: role.id,
        requestId: ctx.requestId,
        ipHash: ctx.ipHash,
        userAgentHash: ctx.userAgentHash,
        metadata: {
          targetRole: role.code,
          grantedCount: updatedCodes.length,
          grantedPermissions: updatedCodes,
        },
      },
      this.db,
    );

    return {
      role: role.code,
      permissions: updatedCodes.sort(),
    };
  }
}
