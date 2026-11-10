import { CookieOptions, Response } from 'express';
import { env } from '../config/env';
import { ACCESS_COOKIE, REFRESH_COOKIE, SessionResult } from '../services/auth.service';

function baseOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
  };
}

export function setSessionCookies(res: Response, session: Pick<SessionResult, 'accessToken' | 'refreshToken'>): void {
  res.cookie(ACCESS_COOKIE, session.accessToken, {
    ...baseOptions(),
    maxAge: env.ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
  res.cookie(REFRESH_COOKIE, session.refreshToken, {
    ...baseOptions(),
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, baseOptions());
  res.clearCookie(REFRESH_COOKIE, baseOptions());
}

export function readRefreshCookie(cookies: Record<string, string> | undefined): string | undefined {
  return cookies?.[REFRESH_COOKIE];
}
