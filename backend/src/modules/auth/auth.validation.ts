import { z } from 'zod';
import { emailSchema, passwordPolicySchema, phoneSchema } from '../../shared/validators';

export const registerPatientBodySchema = z
  .object({
    fullName: z.string().trim().min(2, 'Full name is required.').max(120),
    email: emailSchema,
    phone: phoneSchema.optional(),
    password: passwordPolicySchema,
    confirmPassword: z.string().optional(),
    city: z.string().trim().max(100).optional(),
    stateProvince: z.string().trim().max(100).optional(),
    countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional(),
    acceptedTerms: z.boolean().default(true).refine((v) => v === true, {
      message: 'Terms must be accepted.',
    }),
  })
  .refine((d) => d.confirmPassword === undefined || d.password === d.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export const registerDoctorBodySchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    email: emailSchema,
    phone: phoneSchema,
    password: passwordPolicySchema,
    confirmPassword: z.string().optional(),
    medicalLicenseNumber: z.string().trim().min(4).max(64),
    licensingAuthority: z.string().trim().min(2).max(120),
    licenseCountryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
    specializationCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,64}$/),
    specializationName: z.string().trim().min(2).max(120),
    city: z.string().trim().min(2).max(100),
    stateProvince: z.string().trim().min(2).max(100),
    countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
    acceptedTerms: z.boolean().default(true).refine((v) => v === true, {
      message: 'Terms must be accepted.',
    }),
  })
  .refine((d) => d.confirmPassword === undefined || d.password === d.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export const registerHospitalBodySchema = z
  .object({
    hospitalName: z.string().trim().min(2).max(160),
    email: emailSchema,
    phone: phoneSchema,
    password: passwordPolicySchema,
    confirmPassword: z.string().optional(),
    registrationNumber: z.string().trim().min(4).max(64),
    accreditationBody: z.string().trim().max(120).optional(),
    addressLine1: z.string().trim().min(5).max(200),
    city: z.string().trim().min(2).max(100),
    stateProvince: z.string().trim().min(2).max(100),
    postalCode: z.string().trim().min(3).max(20),
    countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
    acceptedTerms: z.boolean().default(true).refine((v) => v === true, {
      message: 'Terms must be accepted.',
    }),
  })
  .refine((d) => d.confirmPassword === undefined || d.password === d.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export const loginBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required.').max(128),
});

export const verifyEmailBodySchema = z.object({
  token: z.string().trim().min(16, 'Invalid verification token.'),
});

export const forgotPasswordBodySchema = z.object({
  email: emailSchema,
});

export const resetPasswordBodySchema = z
  .object({
    token: z.string().trim().min(16, 'Invalid reset token.'),
    newPassword: passwordPolicySchema.optional(),
    password: passwordPolicySchema.optional(),
    confirmPassword: z.string().optional(),
  })
  .refine((d) => Boolean(d.newPassword || d.password), {
    message: 'New password is required.',
    path: ['newPassword'],
  })
  .refine(
    (d) => {
      const next = d.newPassword ?? d.password;
      return d.confirmPassword === undefined || next === d.confirmPassword;
    },
    {
      message: 'Passwords do not match.',
      path: ['confirmPassword'],
    },
  );

export const changePasswordBodySchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required.'),
    newPassword: passwordPolicySchema,
    confirmPassword: z.string().optional(),
  })
  .refine((d) => d.confirmPassword === undefined || d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });
