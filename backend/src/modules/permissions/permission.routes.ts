import type { PrismaClient } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { createAuthenticateMiddleware } from '../../middleware/authenticate';
import { authorizePermissions, authorizeRoles } from '../../middleware/authorize';
import { csrfProtection } from '../../middleware/csrf-protection';
import { validateRequest } from '../../middleware/validate-request';
import { PERMISSIONS } from '../../security/permissions';
import { hashRequestFingerprint } from '../../security/token-hash';
import { asyncHandler, okResponse } from '../../shared/utils';
import { PermissionService } from './permission.service';

const updateRolePermissionsSchema = z.object({
  permissions: z.array(z.string().trim().min(2)).min(0).max(100),
});

export function createPermissionRoutes(db: PrismaClient = prisma): Router {
  const router = Router();
  const service = new PermissionService(db);
  const authenticate = createAuthenticateMiddleware(db);

  router.get(
    '/permissions',
    authenticate,
    authorizePermissions([PERMISSIONS.ROLES_MANAGE], db),
    asyncHandler(async (_req, res) => {
      const permissions = await service.listPermissions();
      return okResponse(res, { permissions });
    }),
  );

  router.get(
    '/roles',
    authenticate,
    authorizePermissions([PERMISSIONS.ROLES_MANAGE], db),
    asyncHandler(async (_req, res) => {
      const roles = await service.listRoles();
      return okResponse(res, { roles });
    }),
  );

  router.get(
    '/roles/:role/permissions',
    authenticate,
    authorizePermissions([PERMISSIONS.ROLES_MANAGE], db),
    asyncHandler(async (req, res) => {
      const result = await service.getRolePermissions(String(req.params.role ?? ''));
      return okResponse(res, result);
    }),
  );

  router.patch(
    '/roles/:role/permissions',
    csrfProtection,
    authenticate,
    authorizeRoles(['SUPER_ADMIN'], db),
    authorizePermissions([PERMISSIONS.ROLES_MANAGE], db),
    validateRequest({ body: updateRolePermissionsSchema }),
    asyncHandler(async (req, res) => {
      const actor = req.principal!;
      const result = await service.updateRolePermissions(
        {
          actorUserId: actor.userId,
          actorRole: actor.role,
          targetRoleCode: String(req.params.role ?? ''),
          permissionCodes: (req.body as z.infer<typeof updateRolePermissionsSchema>).permissions,
        },
        {
          requestId: res.locals.requestId as string | undefined,
          ipHash: hashRequestFingerprint(req.ip),
          userAgentHash: hashRequestFingerprint(req.header('user-agent')),
        },
      );
      return okResponse(res, result);
    }),
  );

  return router;
}
