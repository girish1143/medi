import { z } from 'zod';
import { dateOnlySchema, paginationSchema, uuidSchema } from './common';

export const recordQuerySchema = paginationSchema.extend({
  patientId: uuidSchema.optional(),
  recordType: z.enum(['lab_report', 'prescription', 'consultation_summary', 'imaging', 'other']).optional(),
  search: z.string().trim().max(100).optional(),
});

export const recordUploadSchema = z.object({
  patientId: uuidSchema.optional(),
  appointmentId: uuidSchema.optional(),
  recordType: z.enum(['lab_report', 'prescription', 'consultation_summary', 'imaging', 'other']).default('other'),
});

export const prescriptionListSchema = paginationSchema.extend({
  patientId: uuidSchema.optional(),
});

export const prescriptionItemSchema = z.object({
  medicineName: z.string().trim().min(1, 'Medicine name is required').max(160),
  dosage: z.string().trim().min(1, 'Dosage is required').max(80),
  frequency: z.string().trim().min(1, 'Frequency is required').max(80),
  duration: z.string().trim().min(1, 'Duration is required').max(80),
  instructions: z.string().trim().max(300).optional(),
});

export const createPrescriptionSchema = z.object({
  appointmentId: uuidSchema,
  diagnosis: z.string().trim().min(3, 'Diagnosis is required').max(1000),
  notes: z.string().trim().max(2000).optional(),
  followUpDate: dateOnlySchema.nullable().optional(),
  items: z.array(prescriptionItemSchema).min(1, 'Add at least one medicine').max(20),
});

export const patientProfileUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  address: z.string().trim().max(300).optional(),
  dateOfBirth: dateOnlySchema.nullable().optional(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).nullable().optional(),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).nullable().optional(),
  emergencyContact: z.string().trim().max(20).nullable().optional(),
});

export const walkInPatientSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().optional(),
  phone: z.string().trim().min(10).max(20),
  dateOfBirth: dateOnlySchema.optional(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),
  address: z.string().trim().max(300).optional(),
});

export const complaintSchema = z.object({
  subject: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(2000),
  appointmentId: uuidSchema.optional(),
});

export const idParamSchema = z.object({ id: uuidSchema });
