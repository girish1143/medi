import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1).default('file:./dev.db'),
  FRONTEND_ORIGIN: z.string().min(1).default('http://localhost:3000'),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters long.'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters long.'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(86400).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  FIELD_ENCRYPTION_KEY: z
    .string()
    .regex(/^([0-9a-fA-F]{64})?$/, 'FIELD_ENCRYPTION_KEY must be 64 hex chars (32 bytes) when set.')
    .optional()
    .default(''),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('lax'),
  COOKIE_DOMAIN: z.string().optional().default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type BackendEnv = z.infer<typeof envSchema>;

let cachedEnv: BackendEnv | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): BackendEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid backend environment configuration: ${details}`);
  }
  return parsed.data;
}

export function getEnv(): BackendEnv {
  if (!cachedEnv) {
    cachedEnv = loadEnv(process.env);
  }
  return cachedEnv;
}

export function resetEnvCache(): void {
  cachedEnv = null;
}

export function getAllowedOrigins(env: BackendEnv = getEnv()): string[] {
  return env.FRONTEND_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
