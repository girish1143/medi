import { z } from 'zod';
import {
  APPOINTMENT_STATUSES,
  CONSENT_PROVIDER_SCOPES,
  CONSENT_PURPOSES,
  CONSULTATION_MODES,
  LEAD_PRIORITIES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  PROVIDER_TYPES,
} from '../domain/enums';

export const updatePatientProfileSchema = z.object({
  city: z.string().trim().min(2).max(100).optional(),
  stateProvince: z.string().trim().min(2).max(100).optional(),
  postalCode: z.string().trim().min(3).max(20).optional(),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional(),
  preferredLanguage: z.string().trim().min(2).max(16).optional(),
  emergencyContactName: z.string().trim().min(2).max(120).optional(),
  emergencyContactPhone: z.string().trim().regex(/^\+?[0-9]{8,15}$/).optional(),
});

export const updateDoctorProfileSchema = z.object({
  qualificationSummary: z.string().trim().max(300).optional(),
  yearsOfExperience: z.number().int().min(0).max(80).optional(),
  consultationMode: z.enum(CONSULTATION_MODES).optional(),
  consultationFeeMinor: z.number().int().min(0).optional(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  isAcceptingLeads: z.boolean().optional(),
  city: z.string().trim().min(2).max(100).optional(),
  stateProvince: z.string().trim().min(2).max(100).optional(),
  bio: z.string().trim().max(1500).optional(),
});

export const updateHospitalProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(160).optional(),
  offersTeleconsultation: z.boolean().optional(),
  isAcceptingLeads: z.boolean().optional(),
  websiteUrl: z.string().url().optional(),
  bedCapacity: z.number().int().min(0).optional(),
});

export const createLeadSchema = z.object({
  specialization: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,64}$/),
  locationCity: z.string().trim().min(2).max(100),
  locationState: z.string().trim().min(2).max(100),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
  consultationMode: z.enum(CONSULTATION_MODES).default('IN_PERSON'),
  enquiryDescription: z.string().trim().min(10).max(1500),
  leadSource: z.enum(LEAD_SOURCES).default('WEB_PORTAL'),
  priority: z.enum(LEAD_PRIORITIES).default('MEDIUM'),
  idempotencyKey: z.string().trim().min(8).max(120),
});

export const updateLeadStatusSchema = z.object({
  status: z.enum(LEAD_STATUSES),
  reason: z.string().trim().min(3).max(500).optional(),
});

export const assignLeadSchema = z.object({
  providerType: z.enum(PROVIDER_TYPES),
  providerId: z.string().uuid(),
  matchScore: z.number().min(0).max(100).optional(),
  expiresAt: z.coerce.date().optional(),
});

export const respondAssignmentSchema = z.object({
  decision: z.enum(['ACCEPTED', 'REJECTED']),
  rejectionReason: z.string().trim().min(3).max(500).optional(),
});

export const grantConsentSchema = z.object({
  leadId: z.string().uuid(),
  consentPurpose: z.enum(CONSENT_PURPOSES),
  authorizedProviderScope: z.enum(CONSENT_PROVIDER_SCOPES),
  authorizedDoctorId: z.string().uuid().optional(),
  authorizedHospitalId: z.string().uuid().optional(),
  consentVersion: z.string().trim().min(2).max(32).default('v1.0'),
});

export const createAppointmentSchema = z.object({
  doctorId: z.string().uuid().optional(),
  hospitalId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  scheduledAt: z.coerce.date(),
  durationMinutes: z.number().int().min(10).max(240).default(30),
  consultationMode: z.enum(['IN_PERSON', 'TELECONSULTATION']).default('IN_PERSON'),
  notes: z.string().trim().max(500).optional(),
}).refine((val) => Boolean(val.doctorId || val.hospitalId), {
  message: 'Either doctorId or hospitalId is required.',
});

export const updateAppointmentSchema = z.object({
  status: z.enum(APPOINTMENT_STATUSES),
  cancellationReason: z.string().trim().min(3).max(500).optional(),
});

export const createContactRequestSchema = z.object({
  leadId: z.string().uuid().optional(),
  doctorId: z.string().uuid().optional(),
  hospitalId: z.string().uuid().optional(),
  preferredChannel: z.enum(['PHONE', 'EMAIL', 'SMS']).default('PHONE'),
  preferredTimeWindow: z.string().trim().max(100).optional(),
  message: z.string().trim().max(500).optional(),
}).refine((val) => Boolean(val.doctorId || val.hospitalId), {
  message: 'Target doctorId or hospitalId is required.',
});
