import type { PrismaClient } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../../config/database';
import { createAuthenticateMiddleware } from '../../middleware/authenticate';
import { csrfProtection } from '../../middleware/csrf-protection';
import { createSlidingRateLimiter } from '../../middleware/rate-limiter';
import { validateRequest } from '../../middleware/validate-request';
import { asyncHandler } from '../../shared/utils';
import { AuthController } from './auth.controller';
import { AuthService, type TokenDispatcher } from './auth.service';
import {
  changePasswordBodySchema,
  forgotPasswordBodySchema,
  loginBodySchema,
  resetPasswordBodySchema,
  verifyEmailBodySchema,
} from './auth.validation';

export function createAuthRoutes(
  db: PrismaClient = prisma,
  dispatchToken?: TokenDispatcher,
): Router {
  const router = Router();
  const service = new AuthService(db, dispatchToken);
  const controller = new AuthController(service);
  const authenticate = createAuthenticateMiddleware(db);
  const authLimiter = createSlidingRateLimiter(30, 60_000);

  router.post('/register', authLimiter, asyncHandler(controller.registerUnified));
  router.post('/register/patient', authLimiter, asyncHandler(controller.registerPatient));
  router.post('/register/doctor', authLimiter, asyncHandler(controller.registerDoctor));
  router.post('/register/hospital', authLimiter, asyncHandler(controller.registerHospital));
  router.post(
    '/verify-email',
    authLimiter,
    validateRequest({ body: verifyEmailBodySchema }),
    asyncHandler(controller.verifyEmail),
  );

  router.post(
    '/login',
    authLimiter,
    validateRequest({ body: loginBodySchema }),
    asyncHandler(controller.login),
  );

  router.post('/refresh', csrfProtection, asyncHandler(controller.refresh));
  router.post('/logout', csrfProtection, authenticate, asyncHandler(controller.logout));
  router.get('/me', authenticate, asyncHandler(controller.me));

  router.post(
    '/forgot-password',
    authLimiter,
    validateRequest({ body: forgotPasswordBodySchema }),
    asyncHandler(controller.forgotPassword),
  );
  router.post(
    '/reset-password',
    authLimiter,
    validateRequest({ body: resetPasswordBodySchema }),
    asyncHandler(controller.resetPassword),
  );
  router.post(
    '/change-password',
    csrfProtection,
    authenticate,
    validateRequest({ body: changePasswordBodySchema }),
    asyncHandler(controller.changePassword),
  );

  return router;
}
