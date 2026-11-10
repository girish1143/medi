import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { findProfileById } from '../repositories/profile.repo';
import { Errors } from '../utils/errors';
import { ACCESS_COOKIE } from '../services/auth.service';
import { getSupabaseAnon } from '../integrations/supabase/client';
import { AuthUser } from '../types/express';

async function resolveUser(req: Request): Promise<AuthUser | null> {
  const header = req.headers.authorization;
  const bearer = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  const token = bearer || (req.cookies?.[ACCESS_COOKIE] as string | undefined);
  if (!token) return null;

  let profileId: string | null = null;

  if (env.AUTH_PROVIDER === 'supabase') {
    const { data, error } = await getSupabaseAnon().auth.getUser(token);
    if (error || !data.user) return null;
    profileId = data.user.id;
  } else {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as { sub?: string; type?: string };
      if (payload.type !== 'access' || !payload.sub) return null;
      profileId = payload.sub;
    } catch {
      return null;
    }
  }

  const profile = await findProfileById(profileId);
  if (!profile) return null;
  if (!profile.isActive) throw Errors.forbidden('This account has been suspended');
  return profile;
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await resolveUser(req);
    if (!user) throw Errors.unauthorized();
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await resolveUser(req);
    if (user) req.user = user;
    next();
  } catch {
    next();
  }
}

export function requireRole(...roles: AuthUser['role'][]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(Errors.unauthorized());
    if (!roles.includes(req.user.role)) return next(Errors.forbidden());
    next();
  };
}

export const requirePatient = requireRole('patient');
export const requireDoctor = requireRole('doctor');
export const requireAdmin = requireRole('admin');
export const requireStaff = requireRole('admin', 'receptionist');
export const requireClinicalStaff = requireRole('doctor', 'admin');
