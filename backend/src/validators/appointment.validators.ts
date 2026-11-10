import { z } from 'zod';
import { dateOnlySchema, paginationSchema, uuidSchema } from './common';

export const bookingSchema = z.object({
  doctorId: uuidSchema,
  clinicId: uuidSchema.optional(),
  startsAt: z.string().datetime({ offset: true }),
  appointmentType: z.enum(['in_clinic', 'online']),
  reason: z.string().trim().max(500).optional(),
  paymentOption: z.enum(['online', 'pay_at_clinic']),
  patientId: uuidSchema.optional(),
});

export const appointmentListSchema = paginationSchema.extend({
  view: z.enum(['upcoming', 'past', 'today', 'all']).optional(),
  status: z.string().max(120).optional(),
  date: dateOnlySchema.optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  search: z.string().trim().max(100).optional(),
  patientId: uuidSchema.optional(),
  doctorId: uuidSchema.optional(),
  sort: z.enum(['recent', 'upcoming']).optional(),
});

export const rescheduleSchema = z.object({
  startsAt: z.string().datetime({ offset: true }),
  reason: z.string().trim().max(300).optional(),
});

export const cancelSchema = z.object({
  reason: z.string().trim().min(3, 'Please provide a cancellation reason').max(300),
});

export const statusSchema = z.object({
  status: z.enum(['confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'rejected', 'no_show']),
  note: z.string().trim().max(500).optional(),
});

export const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

export const appointmentIdParamSchema = z.object({ id: uuidSchema });
