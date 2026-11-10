import { z } from 'zod';

export const uuidSchema = z.string().uuid('Invalid UUID identifier.');

export const emailSchema = z
  .string()
  .trim()
  .email('Valid email address is required.')
  .transform((v) => v.toLowerCase());

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{8,15}$/, 'Phone number must be 8-15 digits with optional leading +.');

export const passwordPolicySchema = z
  .string()
  .min(12, 'Password must be at least 12 characters long.')
  .max(128, 'Password must be at most 128 characters.')
  .regex(/[A-Z]/, 'Password must include at least one uppercase letter.')
  .regex(/[a-z]/, 'Password must include at least one lowercase letter.')
  .regex(/[0-9]/, 'Password must include at least one digit.')
  .regex(/[^A-Za-z0-9]/, 'Password must include at least one special character.');

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const dateRangeQuerySchema = z.object({
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
});
