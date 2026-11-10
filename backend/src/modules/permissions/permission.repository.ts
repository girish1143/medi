import type { PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database';
import { ensureRbacCatalog } from '../../security/permissions';

export class PermissionRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async listPermissions() {
    await ensureRbacCatalog(this.db);
    return this.db.adminPermission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });
  }

  async listRolesWithPermissions() {
    await ensureRbacCatalog(this.db);
    return this.db.adminRole.findMany({
      orderBy: { code: 'asc' },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });
  }

  async findRoleByCode(code: string) {
    await ensureRbacCatalog(this.db);
    return this.db.adminRole.findUnique({
      where: { code },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });
  }

  async replaceRolePermissions(adminRoleId: string, permissionCodes: string[]) {
    const permissions = await this.db.adminPermission.findMany({
      where: { code: { in: permissionCodes } },
      select: { id: true, code: true },
    });

    await this.db.$transaction(async (tx) => {
      await tx.adminRolePermission.deleteMany({ where: { adminRoleId } });
      for (const perm of permissions) {
        await tx.adminRolePermission.create({
          data: { adminRoleId, permissionId: perm.id },
        });
      }
    });

    return permissions.map((p) => p.code);
  }
}
