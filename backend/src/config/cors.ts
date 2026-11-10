import type { CorsOptions } from 'cors';
import { getAllowedOrigins, getEnv } from './env';
import { SECURITY_CONSTANTS } from './security';

export function buildCorsOptions(): CorsOptions {
  const env = getEnv();
  const allowedOrigins = new Set(getAllowedOrigins(env));

  return {
    origin(origin, callback) {
      // Non-browser / server-to-server requests omit Origin
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin '${origin}' is not permitted by CORS policy.`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      SECURITY_CONSTANTS.CSRF_HEADER_NAME,
      'x-request-id',
      'idempotency-key',
    ],
    exposedHeaders: ['x-request-id'],
    maxAge: 600,
  };
}
