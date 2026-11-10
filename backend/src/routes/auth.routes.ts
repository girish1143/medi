import { Router } from 'express';
import * as controller from '../controllers/auth.controller';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyOtpSchema,
} from '../validators/auth.validators';
import { authLimiter } from '../middlewares/rateLimit';
import { asyncHandler } from '../utils/http';

const router = Router();

router.post('/register', authLimiter, validate({ body: registerSchema }), asyncHandler(controller.register));
router.post('/login', authLimiter, validate({ body: loginSchema }), asyncHandler(controller.login));
router.post('/refresh', asyncHandler(controller.refresh));
router.post('/logout', asyncHandler(controller.logout));
router.post(
  '/forgot-password',
  authLimiter,
  validate({ body: forgotPasswordSchema }),
  asyncHandler(controller.forgotPassword),
);
router.post(
  '/reset-password',
  authLimiter,
  validate({ body: resetPasswordSchema }),
  asyncHandler(controller.resetPassword),
);
router.post('/verify-otp', authLimiter, validate({ body: verifyOtpSchema }), asyncHandler(controller.verifyOtp));
router.get('/me', authenticate, asyncHandler(controller.me));

export default router;
