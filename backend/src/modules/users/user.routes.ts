import type { PrismaClient } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { createAuthenticateMiddleware } from '../../middleware/authenticate';
import { authorizePermissions } from '../../middleware/authorize';
import { requireSelfOrAdminPermission } from '../../middleware/check-ownership';
import { csrfProtection } from '../../middleware/csrf-protection';
import { validateRequest } from '../../middleware/validate-request';
import { PERMISSIONS } from '../../security/permissions';
import { asyncHandler } from '../../shared/utils';
import { uuidSchema } from '../../shared/validators';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { updateUserStatusBodySchema } from './user.validation';

const idParamsSchema = z.object({ id: uuidSchema });

export function createUserRoutes(db: PrismaClient = prisma): Router {
  const router = Router();
  const service = new UserService(db);
  const controller = new UserController(service);
  const authenticate = createAuthenticateMiddleware(db);

  router.get(
    '/',
    authenticate,
    authorizePermissions([PERMISSIONS.USERS_READ], db),
    asyncHandler(controller.list),
  );

  router.post(
    '/',
    csrfProtection,
    authenticate,
    authorizePermissions([PERMISSIONS.USERS_CREATE], db),
    asyncHandler(controller.createAdmin),
  );

  router.get(
    '/:id',
    authenticate,
    validateRequest({ params: idParamsSchema }),
    requireSelfOrAdminPermission('id', PERMISSIONS.USERS_READ, db),
    asyncHandler(controller.getById),
  );

  router.patch(
    '/:id',
    csrfProtection,
    authenticate,
    validateRequest({ params: idParamsSchema }),
    requireSelfOrAdminPermission('id', PERMISSIONS.USERS_UPDATE, db),
    asyncHandler(controller.update),
  );

  router.patch(
    '/:id/status',
    csrfProtection,
    authenticate,
    validateRequest({ params: idParamsSchema, body: updateUserStatusBodySchema }),
    authorizePermissions([PERMISSIONS.USERS_SUSPEND], db),
    asyncHandler(controller.updateStatus),
  );

  router.delete(
    '/:id',
    csrfProtection,
    authenticate,
    validateRequest({ params: idParamsSchema }),
    authorizePermissions([PERMISSIONS.USERS_DELETE], db),
    asyncHandler(controller.softDelete),
  );

  return router;
}
