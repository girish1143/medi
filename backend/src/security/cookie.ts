import crypto from 'node:crypto';
import type { CookieOptions, Response } from 'express';
import { getEnv } from '../config/env';
import { SECURITY_CONSTANTS } from '../config/security';

function baseCookieOptions(): CookieOptions {
  const env = getEnv();
  const isProd = env.NODE_ENV === 'production';
  const secure = env.COOKIE_SECURE ?? isProd;
  return {
    sameSite: env.COOKIE_SAME_SITE,
    secure,
    path: '/',
    ...(env.COOKIE_DOMAIN && env.COOKIE_DOMAIN !== 'localhost'
      ? { domain: env.COOKIE_DOMAIN }
      : {}),
  };
}

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string; csrfToken?: string },
): string {
  const env = getEnv();
  const base = baseCookieOptions();
  const csrfToken = tokens.csrfToken ?? crypto.randomBytes(24).toString('base64url');

  res.cookie(SECURITY_CONSTANTS.ACCESS_COOKIE_NAME, tokens.accessToken, {
    ...base,
    httpOnly: true,
    maxAge: env.ACCESS_TOKEN_TTL_SECONDS * 1000,
  });

  res.cookie(SECURITY_CONSTANTS.REFRESH_COOKIE_NAME, tokens.refreshToken, {
    ...base,
    httpOnly: true,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });

  // Non-HttpOnly double-submit CSRF cookie paired cleanly with X-CSRF-Token request header
  res.cookie(SECURITY_CONSTANTS.CSRF_COOKIE_NAME, csrfToken, {
    ...base,
    httpOnly: false,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });

  return csrfToken;
}

export function clearAuthCookies(res: Response): void {
  const base = baseCookieOptions();
  res.clearCookie(SECURITY_CONSTANTS.ACCESS_COOKIE_NAME, { ...base, httpOnly: true });
  res.clearCookie(SECURITY_CONSTANTS.REFRESH_COOKIE_NAME, { ...base, httpOnly: true });
  res.clearCookie(SECURITY_CONSTANTS.CSRF_COOKIE_NAME, { ...base, httpOnly: false });
}
