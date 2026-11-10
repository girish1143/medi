import { z } from 'zod';
import { emailSchema, passwordSchema, phoneSchema } from './common';

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(80),
  email: emailSchema,
  phone: phoneSchema.optional(),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  email: emailSchema,
  token: z.string().min(10, 'Reset token is required'),
  password: passwordSchema,
});

export const verifyOtpSchema = z.object({
  email: emailSchema,
  token: z.string().trim().min(4).max(10),
});

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(80).optional(),
  phone: phoneSchema.nullable().optional(),
  address: z.string().trim().max(300).optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).nullable().optional(),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).nullable().optional(),
  emergencyContact: phoneSchema.nullable().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
