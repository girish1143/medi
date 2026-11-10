import { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import { sendSuccess } from '../utils/http';
import { clearSessionCookies, readRefreshCookie, setSessionCookies } from '../utils/cookies';
import { RequestMeta } from '../types/express';
import { AppError } from '../utils/errors';

function meta(req: Request): RequestMeta {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

export async function register(req: Request, res: Response): Promise<void> {
  const session = await authService.register(req.body, meta(req));
  setSessionCookies(res, session);
  sendSuccess(res, session.user, 'Account created successfully', 201);
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;
  const session = await authService.login(email, password, meta(req));
  setSessionCookies(res, session);
  sendSuccess(res, session.user, 'Signed in successfully');
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const token = readRefreshCookie(req.cookies);
  const session = await authService.refreshSession(token, meta(req));
  setSessionCookies(res, session);
  sendSuccess(res, session.user, 'Session refreshed');
}

export async function logout(req: Request, res: Response): Promise<void> {
  await authService.logout(readRefreshCookie(req.cookies), req.cookies?.[authService.ACCESS_COOKIE]);
  clearSessionCookies(res);
  sendSuccess(res, null, 'Signed out successfully');
}

export async function me(req: Request, res: Response): Promise<void> {
  sendSuccess(res, req.user, 'Current user');
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const result = await authService.requestPasswordReset(req.body.email, meta(req));
  sendSuccess(
    res,
    result,
    'If an account exists for this email, a password reset link has been sent',
  );
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const { email, token, password } = req.body;
  await authService.resetPassword(token, email, password);
  sendSuccess(res, null, 'Password reset successfully. Please sign in.');
}

export async function verifyOtp(req: Request, res: Response): Promise<void> {
  const { email, token } = req.body;
  await authService.verifyOtp(email, token);
  sendSuccess(res, null, 'Email verified successfully');
}

export async function sessionDebug(req: Request, res: Response): Promise<void> {
  if (process.env.NODE_ENV === 'production') throw new AppError(404, 'NOT_FOUND', 'Not found');
  sendSuccess(res, { user: req.user ?? null });
}
