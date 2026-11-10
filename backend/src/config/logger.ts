import pino, { type Logger } from 'pino';
import { getEnv } from './env';

export const LOGGER_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.refreshToken',
  '*.refreshTokenHash',
  '*.accessToken',
  '*.token',
  '*.secret',
  '*.enquiryDescription',
  '*.cardNumber',
  '*.cvv',
  '*.pan',
  '*.jwtSecret',
];

let cachedLogger: Logger | null = null;

export function createLogger(level?: string): Logger {
  const env = getEnv();
  return pino({
    level: level ?? (env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL),
    redact: {
      paths: LOGGER_REDACT_PATHS,
      censor: '[REDACTED]',
    },
    base: {
      service: 'hospital-platform-backend',
      env: env.NODE_ENV,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export function getLogger(): Logger {
  if (!cachedLogger) {
    cachedLogger = createLogger();
  }
  return cachedLogger;
}
