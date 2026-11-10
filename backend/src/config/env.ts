import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

const envFile =
  process.env.NODE_ENV === 'test'
    ? path.resolve(__dirname, '../../.env.test')
    : path.resolve(__dirname, '../../.env');

dotenv.config({ path: envFile });
dotenv.config();

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: bool,
  DEV_EMBEDDED_PG: bool,
  DEV_PG_PORT: z.coerce.number().int().default(55432),
  DEV_PG_DIR: z.string().default('.pgdata'),
  SEED_ON_START: bool,
  AUTO_MIGRATE: bool,

  AUTH_PROVIDER: z.enum(['local', 'supabase']).default('local'),
  JWT_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  COOKIE_SECURE: bool,

  SUPABASE_URL: z.string().optional().default(''),
  SUPABASE_ANON_KEY: z.string().optional().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(''),
  SUPABASE_MEDICAL_BUCKET: z.string().default('medical-records'),
  SUPABASE_AVATAR_BUCKET: z.string().default('avatars'),

  STORAGE_PROVIDER: z.enum(['local', 'supabase']).default('local'),
  LOCAL_STORAGE_DIR: z.string().default('storage'),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(300),

  PAYMENTS_MODE: z.enum(['dev', 'razorpay']).default('dev'),
  RAZORPAY_KEY_ID: z.string().optional().default(''),
  RAZORPAY_KEY_SECRET: z.string().optional().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(''),
  RAZORPAY_CURRENCY: z.string().default('INR'),

  BOOKING_MIN_NOTICE_MINUTES: z.coerce.number().int().min(0).default(60),
  BOOKING_MAX_ADVANCE_DAYS: z.coerce.number().int().positive().default(60),
  CANCELLATION_MIN_HOURS: z.coerce.number().int().min(0).default(4),
  RESCHEDULE_MIN_HOURS: z.coerce.number().int().min(0).default(4),
  PAY_AT_CLINIC_ENABLED: bool,

  EMAIL_PROVIDER: z.enum(['console', 'resend']).default('console'),
  EMAIL_FROM: z.string().default('MediBook <no-reply@medibook.test>'),
  EMAIL_API_KEY: z.string().optional().default(''),
  SMS_PROVIDER: z.enum(['console', 'msg91']).default('console'),
  SMS_API_KEY: z.string().optional().default(''),
  REMINDER_CRON_ENABLED: bool,

  RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(600),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:\n', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const base = parsed.data;

// Fail closed on insecure production configuration.
if (base.NODE_ENV === 'production') {
  const problems: string[] = [];
  if (base.AUTH_PROVIDER !== 'supabase') problems.push('AUTH_PROVIDER must be "supabase" in production');
  if (!base.SUPABASE_URL) problems.push('SUPABASE_URL is required');
  if (!base.SUPABASE_SERVICE_ROLE_KEY) problems.push('SUPABASE_SERVICE_ROLE_KEY is required');
  if (base.STORAGE_PROVIDER !== 'supabase') problems.push('STORAGE_PROVIDER must be "supabase" in production');
  if (base.PAYMENTS_MODE !== 'razorpay') problems.push('PAYMENTS_MODE must be "razorpay" in production');
  if (!base.RAZORPAY_KEY_ID || !base.RAZORPAY_KEY_SECRET || !base.RAZORPAY_WEBHOOK_SECRET) {
    problems.push('Razorpay credentials are required in production');
  }
  if (!base.COOKIE_SECURE) problems.push('COOKIE_SECURE must be true in production');
  if (base.JWT_SECRET.startsWith('dev-')) problems.push('JWT_SECRET must be a real secret in production');
  if (problems.length) {
    // eslint-disable-next-line no-console
    console.error('Refusing to start with insecure production configuration:\n - ' + problems.join('\n - '));
    process.exit(1);
  }
}

export const env = {
  ...base,
  CORS_ORIGINS: base.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  isProd: base.NODE_ENV === 'production',
  isTest: base.NODE_ENV === 'test',
  isDev: base.NODE_ENV === 'development',
};

export type Env = typeof env;
