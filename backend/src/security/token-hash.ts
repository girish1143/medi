import crypto from 'node:crypto';

export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export function generateOpaqueToken(byteLength = 32): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(byteLength).toString('base64url');
  return {
    rawToken,
    tokenHash: hashToken(rawToken),
  };
}

export function timingSafeEqualHex(hexA: string, hexB: string): boolean {
  if (!hexA || !hexB || hexA.length !== hexB.length) {
    return false;
  }
  try {
    const bufA = Buffer.from(hexA, 'hex');
    const bufB = Buffer.from(hexB, 'hex');
    if (bufA.length !== bufB.length) {
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export function hashRequestFingerprint(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return crypto.createHash('sha256').update(trimmed, 'utf8').digest('hex').slice(0, 32);
}
