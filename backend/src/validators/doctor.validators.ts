import { z } from 'zod';
import { dateOnlySchema, paginationSchema, uuidSchema } from './common';

export const doctorSearchSchema = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  specialty: z.string().trim().max(80).optional(),
  city: z.string().trim().max(80).optional(),
  area: z.string().trim().max(80).optional(),
  minFee: z.coerce.number().min(0).optional(),
  maxFee: z.coerce.number().min(0).optional(),
  minExperience: z.coerce.number().min(0).max(70).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  availableToday: z.enum(['true', 'false']).optional(),
  consultationType: z.enum(['in_clinic', 'online']).optional(),
  sort: z.enum(['rating', 'fee_asc', 'fee_desc', 'experience', 'name', 'next_available']).optional(),
});

export const doctorIdParamSchema = z.object({ id: uuidSchema });

export const slotsQuerySchema = z.object({
  date: dateOnlySchema,
  type: z.enum(['in_clinic', 'online']).optional(),
});

export const createDoctorSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(20).optional(),
  password: z.string().min(8).max(72).optional(),
  qualification: z.string().trim().min(3).max(160),
  registrationNumber: z.string().trim().min(3).max(60),
  experienceYears: z.coerce.number().int().min(0).max(70),
  biography: z.string().trim().max(2000).optional(),
  consultationFee: z.coerce.number().min(100).max(100000),
  onlineConsultationFee: z.coerce.number().min(0).max(100000).optional(),
  languages: z.array(z.string().trim().min(2).max(30)).max(10).optional(),
  specialtyIds: z.array(uuidSchema).min(1).max(5),
  clinicIds: z.array(uuidSchema).max(5).optional(),
});

export const updateDoctorSchema = z.object({
  fullName: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  qualification: z.string().trim().min(3).max(160).optional(),
  experienceYears: z.coerce.number().int().min(0).max(70).optional(),
  biography: z.string().trim().max(2000).optional(),
  consultationFee: z.coerce.number().min(0).max(100000).optional(),
  onlineConsultationFee: z.coerce.number().min(0).max(100000).nullable().optional(),
  languages: z.array(z.string().trim().min(2).max(30)).max(10).optional(),
});

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');

export const availabilitySchema = z.object({
  slots: z
    .array(
      z.object({
        weekday: z.coerce.number().int().min(0).max(6),
        startTime: timeSchema,
        endTime: timeSchema,
        slotMinutes: z.coerce.number().int().refine((v) => [15, 20, 30, 60].includes(v), 'Use 15, 20, 30 or 60 minutes'),
        breakStart: timeSchema.nullable().optional(),
        breakEnd: timeSchema.nullable().optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .max(40),
});

export const timeOffSchema = z.object({
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  reason: z.string().trim().max(300).optional(),
});

export const verificationSchema = z.object({
  status: z.enum(['verified', 'rejected', 'suspended', 'pending']),
  note: z.string().trim().max(500).optional(),
});
