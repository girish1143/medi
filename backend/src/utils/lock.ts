/**
 * Converts a UUID string into a stable 32-bit integer for PostgreSQL's
 * two-argument advisory lock API. Collisions across different doctors inside
 * the same namespace are extremely unlikely and only reduce concurrency.
 */
export function pgAdvisoryLockKey(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return hash;
}
