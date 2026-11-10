import type { PrismaClient } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/database';
import { SECURITY_CONSTANTS } from '../config/security';
import { TooManyRequestsError } from '../shared/errors';

export interface RateLimitPolicy {
  prefix: string;
  maxAttempts: number;
  windowMs: number;
  lockoutMs: number;
}

export const LOGIN_RATE_POLICY: RateLimitPolicy = {
  prefix: 'login',
  maxAttempts: SECURITY_CONSTANTS.LOGIN_RATE_LIMIT.maxAttempts,
  windowMs: SECURITY_CONSTANTS.LOGIN_RATE_LIMIT.windowMs,
  lockoutMs: SECURITY_CONSTANTS.LOGIN_RATE_LIMIT.lockoutMs,
};

export const PASSWORD_RESET_RATE_POLICY: RateLimitPolicy = {
  prefix: 'pwdreset',
  maxAttempts: SECURITY_CONSTANTS.PASSWORD_RESET_RATE_LIMIT.maxAttempts,
  windowMs: SECURITY_CONSTANTS.PASSWORD_RESET_RATE_LIMIT.windowMs,
  lockoutMs: SECURITY_CONSTANTS.PASSWORD_RESET_RATE_LIMIT.lockoutMs,
};

function normalizeKey(prefix: string, identifier: string): string {
  return `${prefix}:${identifier.trim().toLowerCase()}`;
}

export async function assertRateLimitNotLocked(
  policy: RateLimitPolicy,
  identifier: string,
  db: PrismaClient = prisma,
): Promise<void> {
  const key = normalizeKey(policy.prefix, identifier);
  const existing = await db.authRateLimit.findUnique({ where: { key } });
  if (!existing?.lockedUntil) return;

  const remainingMs = existing.lockedUntil.getTime() - Date.now();
  if (remainingMs > 0) {
    throw new TooManyRequestsError(Math.ceil(remainingMs / 1000));
  }
}

export async function recordRateLimitFailure(
  policy: RateLimitPolicy,
  identifier: string,
  db: PrismaClient = prisma,
): Promise<void> {
  const key = normalizeKey(policy.prefix, identifier);
  const now = new Date();
  const existing = await db.authRateLimit.findUnique({ where: { key } });

  if (!existing || now.getTime() - existing.windowStart.getTime() > policy.windowMs) {
    await db.authRateLimit.upsert({
      where: { key },
      create: {
        key,
        attemptCount: 1,
        windowStart: now,
        lockedUntil: policy.maxAttempts <= 1 ? new Date(now.getTime() + policy.lockoutMs) : null,
      },
      update: {
        attemptCount: 1,
        windowStart: now,
        lockedUntil: policy.maxAttempts <= 1 ? new Date(now.getTime() + policy.lockoutMs) : null,
      },
    });
    return;
  }

  const nextCount = existing.attemptCount + 1;
  const lockedUntil =
    nextCount >= policy.maxAttempts ? new Date(now.getTime() + policy.lockoutMs) : null;

  await db.authRateLimit.update({
    where: { key },
    data: {
      attemptCount: nextCount,
      lockedUntil,
    },
  });
}

export async function clearRateLimit(
  policy: RateLimitPolicy,
  identifier: string,
  db: PrismaClient = prisma,
): Promise<void> {
  await db.authRateLimit.deleteMany({
    where: { key: normalizeKey(policy.prefix, identifier) },
  });
}

const slidingWindowCounters = new Map<string, { count: number; resetAt: number }>();

export function createSlidingRateLimiter(
  maxRequests: number = SECURITY_CONSTANTS.GENERAL_API_RATE_LIMIT.maxRequests,
  windowMs: number = SECURITY_CONSTANTS.GENERAL_API_RATE_LIMIT.windowMs,
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const key = `${req.ip || 'unknown'}:${req.path}`;
    const now = Date.now();
    const entry = slidingWindowCounters.get(key);

    if (!entry || entry.resetAt <= now) {
      slidingWindowCounters.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    entry.count += 1;
    if (entry.count > maxRequests) {
      next(new TooManyRequestsError(Math.ceil((entry.resetAt - now) / 1000)));
      return;
    }

    next();
  };
}
