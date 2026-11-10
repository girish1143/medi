import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .min(1, 'CORS_ALLOWED_ORIGINS must define at least one allowed origin')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    )
    .refine((origins) => origins.length > 0, {
      message: 'CORS_ALLOWED_ORIGINS must contain at least one valid origin',
    }),
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_ANON_KEY: z.string().min(20, 'SUPABASE_ANON_KEY must be set'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20, 'SUPABASE_SERVICE_ROLE_KEY must be set'),
  PAYMENT_WEBHOOK_SECRET: z.string().optional(),
});

export type BackendEnv = z.infer<typeof envSchema>;

let cachedEnv: BackendEnv | null = null;

/**
 * Validates raw environment variables against the backend schema.
 */
export function parseBackendEnv(rawEnv: Record<string, string | undefined>): BackendEnv {
  const result = envSchema.safeParse(rawEnv);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid backend environment configuration: ${details}`);
  }

  if (result.data.SUPABASE_ANON_KEY === result.data.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'Invalid backend environment configuration: SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY must be distinct.',
    );
  }

  return result.data;
}

/**
 * Returns memoized validated environment variables from process.env.
 */
export function getBackendEnv(): BackendEnv {
  if (!cachedEnv) {
    cachedEnv = parseBackendEnv(process.env);
  }
  return cachedEnv;
}
