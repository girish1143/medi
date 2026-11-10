export const SECURITY_CONSTANTS = {
  PASSWORD_MIN_LENGTH: 12,
  PASSWORD_MAX_LENGTH: 128,
  ARGON2_MEMORY_KB: 19456,
  ARGON2_ITERATIONS: 2,
  ARGON2_PARALLELISM: 1,
  ARGON2_HASH_LENGTH: 32,
  ACCESS_COOKIE_NAME: 'hlp_access_token',
  REFRESH_COOKIE_NAME: 'hlp_refresh_token',
  CSRF_COOKIE_NAME: 'hlp_csrf_token',
  CSRF_HEADER_NAME: 'x-csrf-token',
  MAX_JSON_BODY_LIMIT: '1mb',
  LOGIN_RATE_LIMIT: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000,
    lockoutMs: 15 * 60 * 1000,
  },
  PASSWORD_RESET_RATE_LIMIT: {
    maxAttempts: 5,
    windowMs: 60 * 60 * 1000,
    lockoutMs: 60 * 60 * 1000,
  },
  GENERAL_API_RATE_LIMIT: {
    maxRequests: 120,
    windowMs: 60 * 1000,
  },
} as const;
