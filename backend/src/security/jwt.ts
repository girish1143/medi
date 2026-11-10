import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { getEnv } from '../config/env';
import type { UserRole } from '../shared/constants';
import { UnauthorizedError } from '../shared/errors';

const TOKEN_ISSUER = 'hospital-platform-backend';
const TOKEN_AUDIENCE = 'hospital-platform-api';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  sid: string;
  ver: number;
  jti: string;
  typ: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  sid: string;
  fid: string;
  jti: string;
  typ: 'refresh';
}

export function signAccessToken(input: {
  userId: string;
  email: string;
  role: UserRole;
  sessionId: string;
  sessionVersion: number;
}): string {
  const env = getEnv();
  return jwt.sign(
    {
      email: input.email,
      role: input.role,
      sid: input.sessionId,
      ver: input.sessionVersion,
      typ: 'access',
    },
    env.JWT_ACCESS_SECRET,
    {
      algorithm: 'HS256',
      subject: input.userId,
      jwtid: crypto.randomUUID(),
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
      expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    },
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const env = getEnv();
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    });
    if (typeof decoded !== 'object' || decoded === null || decoded.typ !== 'access' || !decoded.sub || !decoded.sid) {
      throw new UnauthorizedError('INVALID_ACCESS_TOKEN', 'Invalid access token claims.');
    }
    return decoded as unknown as AccessTokenPayload;
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    if (err instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('ACCESS_TOKEN_EXPIRED', 'Access token has expired.');
    }
    throw new UnauthorizedError('INVALID_ACCESS_TOKEN', 'Invalid authentication token.');
  }
}

export function signRefreshToken(input: {
  userId: string;
  sessionId: string;
  tokenFamilyId: string;
  jti?: string;
}): string {
  const env = getEnv();
  return jwt.sign(
    {
      sid: input.sessionId,
      fid: input.tokenFamilyId,
      typ: 'refresh',
    },
    env.JWT_REFRESH_SECRET,
    {
      algorithm: 'HS256',
      subject: input.userId,
      jwtid: input.jti ?? crypto.randomUUID(),
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
      expiresIn: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
    },
  );
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const env = getEnv();
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, {
      algorithms: ['HS256'],
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    });
    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      decoded.typ !== 'refresh' ||
      !decoded.sub ||
      !decoded.sid ||
      !decoded.fid
    ) {
      throw new UnauthorizedError('INVALID_REFRESH_TOKEN', 'Invalid refresh token claims.');
    }
    return decoded as unknown as RefreshTokenPayload;
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    if (err instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('REFRESH_TOKEN_EXPIRED', 'Refresh token has expired.');
    }
    throw new UnauthorizedError('INVALID_REFRESH_TOKEN', 'Invalid refresh token.');
  }
}
