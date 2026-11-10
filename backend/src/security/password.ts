import crypto from 'node:crypto';
import { argon2id, argon2Verify } from 'hash-wasm';
import { SECURITY_CONSTANTS } from '../config/security';
import { passwordPolicySchema } from '../shared/validators';

export function validatePasswordStrength(password: string): string {
  return passwordPolicySchema.parse(password);
}

export async function hashPassword(password: string): Promise<string> {
  validatePasswordStrength(password);
  const salt = crypto.randomBytes(16);
  return argon2id({
    password,
    salt,
    parallelism: SECURITY_CONSTANTS.ARGON2_PARALLELISM,
    iterations: SECURITY_CONSTANTS.ARGON2_ITERATIONS,
    memorySize: SECURITY_CONSTANTS.ARGON2_MEMORY_KB,
    hashLength: SECURITY_CONSTANTS.ARGON2_HASH_LENGTH,
    outputType: 'encoded',
  });
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  if (!password || !encodedHash || !encodedHash.startsWith('$argon2id$')) {
    return false;
  }
  try {
    return await argon2Verify({ password, hash: encodedHash });
  } catch {
    return false;
  }
}
