import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { getAllowedOrigins } from '../config/env';
import { SECURITY_CONSTANTS } from '../config/security';
import { ForbiddenError } from '../shared/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Enforces CSRF protection for cookie-authenticated state-changing HTTP methods:
 * 1. Validates Origin header (when supplied by browsers) against configured allowed origins.
 * 2. Requires matching double-submit CSRF cookie + X-CSRF-Token header whenever auth cookies are present.
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  const origin = req.header('origin');
  if (origin) {
    const allowed = new Set(getAllowedOrigins());
    const host = req.header('host');
    const matchesAllowed = allowed.has(origin);
    let matchesHost = false;
    try {
      matchesHost = Boolean(host && new URL(origin).host === host);
    } catch {
      matchesHost = false;
    }
    if (!matchesAllowed && !matchesHost) {
      next(new ForbiddenError('CSRF_ORIGIN_MISMATCH', 'Cross-origin mutation request rejected.'));
      return;
    }
  }

  const hasAuthCookie = Boolean(
    req.cookies?.[SECURITY_CONSTANTS.ACCESS_COOKIE_NAME] ||
      req.cookies?.[SECURITY_CONSTANTS.REFRESH_COOKIE_NAME],
  );

  // Pure Authorization: Bearer token clients (non-cookie API callers) do not rely on implicit cookies
  if (!hasAuthCookie) {
    next();
    return;
  }

  const csrfCookie = req.cookies?.[SECURITY_CONSTANTS.CSRF_COOKIE_NAME] as string | undefined;
  const csrfHeader = req.header(SECURITY_CONSTANTS.CSRF_HEADER_NAME);

  if (!csrfCookie || !csrfHeader || !constantTimeEquals(csrfCookie, csrfHeader)) {
    next(new ForbiddenError('CSRF_TOKEN_INVALID', 'Missing or invalid CSRF protection token.'));
    return;
  }

  next();
}
