import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 12;

/**
 * Hashes plaintext passwords using bcryptjs before persistence.
 * Never store plaintext passwords.
 */
export async function hashPassword(plaintext: string): Promise<string> {
  if (plaintext.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
  }
  return bcrypt.hash(plaintext, BCRYPT_ROUNDS);
}

/**
 * Verifies a candidate password against a stored bcrypt hash in constant time.
 */
export async function verifyPassword(plaintext: string, storedHash: string): Promise<boolean> {
  if (!plaintext || !storedHash) {
    return false;
  }
  return bcrypt.compare(plaintext, storedHash);
}
