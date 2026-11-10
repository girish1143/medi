import crypto from 'node:crypto';
import { env } from '../config/env';

export function randomToken(bytes = 48): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function hmacSha256(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Signed, expiring URL token for locally stored private files. */
export function signStorageToken(relativePath: string, ttlSeconds = env.SIGNED_URL_TTL_SECONDS): string {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const signature = hmacSha256(`${relativePath}:${expires}`, env.JWT_SECRET);
  return `${expires}.${signature}`;
}

export function verifyStorageToken(relativePath: string, token: string): boolean {
  const [expiresRaw, signature] = token.split('.');
  const expires = Number(expiresRaw);
  if (!expires || !signature || expires < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(signature, hmacSha256(`${relativePath}:${expires}`, env.JWT_SECRET));
}

export function idempotencyKey(parts: Array<string | number>): string {
  return sha256(parts.join('|')).slice(0, 48);
}
