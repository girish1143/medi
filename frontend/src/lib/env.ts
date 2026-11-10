import { z } from 'zod';

const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export function getBackendInternalOrigin(): string {
  if (typeof window !== 'undefined') {
    throw new Error('SECURITY VIOLATION: Internal backend URL lookup must run server-side only.');
  }
  return process.env.BACKEND_INTERNAL_ORIGIN?.replace(/\/$/, '') ?? 'http://127.0.0.1:4000';
}

export function getPublicEnv(): PublicEnv {
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
  if (!parsed.success) {
    return { NEXT_PUBLIC_APP_ENV: 'development' };
  }
  return parsed.data;
}
