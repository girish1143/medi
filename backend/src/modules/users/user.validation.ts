import { z } from 'zod';
import { ACCOUNT_STATUSES, USER_ROLES } from '../../shared/constants';
import { emailSchema, paginationQuerySchema, passwordPolicySchema, phoneSchema } from '../../shared/validators';

export const listUsersQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().optional(),
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(ACCOUNT_STATUSES).optional(),
});

export const createAdminUserBodySchema = z.object({
  email: emailSchema,
  fullName: z.string().trim().min(2).max(120),
  phone: phoneSchema.optional(),
  password: passwordPolicySchema,
  roleCode: z.enum(['OPERATIONS_ADMIN', 'FINANCE_ADMIN', 'SUPPORT_ADMIN']),
});

export const updateUserBodySchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: phoneSchema.nullable().optional(),
});

export const updateUserStatusBodySchema = z.object({
  status: z.enum(ACCOUNT_STATUSES),
  reason: z.string().trim().min(3, 'Status change reason must be at least 3 characters.').max(500),
});
