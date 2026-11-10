import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { Errors } from '../utils/errors';

export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  limit: env.isTest ? 100_000 : env.RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, _res, next) => next(Errors.tooManyRequests()),
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? 100_000 : 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (_req, _res, next) => next(Errors.tooManyRequests('Too many authentication attempts, try again later')),
});
