import { z } from 'zod';
import { paginationSchema, uuidSchema } from './common';

export const adminListSchema = paginationSchema.extend({
  role: z.enum(['patient', 'doctor', 'admin', 'receptionist']).optional(),
  status: z.enum(['pending', 'verified', 'rejected', 'suspended']).optional(),
  search: z.string().trim().max(100).optional(),
});

export const paymentsQuerySchema = paginationSchema.extend({
  status: z.enum(['created', 'captured', 'failed', 'refunded', 'partially_refunded']).optional(),
  provider: z.enum(['razorpay', 'pay_at_clinic', 'manual']).optional(),
  search: z.string().trim().max(100).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

export const refundSchema = z.object({
  amount: z.coerce.number().min(1).max(500000).optional(),
  reason: z.string().trim().min(5).max(300),
});

export const settingsSchema = z.object({
  booking_min_notice_minutes: z.coerce.number().int().min(0).max(10080).optional(),
  booking_max_advance_days: z.coerce.number().int().min(1).max(365).optional(),
  cancellation_min_hours: z.coerce.number().int().min(0).max(720).optional(),
  reschedule_min_hours: z.coerce.number().int().min(0).max(720).optional(),
  pay_at_clinic_enabled: z.boolean().optional(),
  auto_confirm_appointments: z.boolean().optional(),
  clinic_name: z.string().trim().max(120).optional(),
  support_email: z.string().email().optional(),
  support_phone: z.string().trim().max(30).optional(),
  maintenance_mode: z.boolean().optional(),
  refund_processing_days: z.coerce.number().int().min(0).max(60).optional(),
});

export const auditQuerySchema = paginationSchema.extend({
  action: z.string().trim().max(100).optional(),
  entityType: z.string().trim().max(60).optional(),
});

export const complaintUpdateSchema = z.object({
  status: z.enum(['open', 'in_review', 'resolved', 'rejected']),
  resolution: z.string().trim().max(1000).optional(),
});

export const reviewModerationSchema = z.object({
  isVisible: z.boolean(),
});

export const specialtyCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional(),
  icon: z.string().trim().max(60).optional(),
});

export const specialtyUpdateSchema = specialtyCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const clinicCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  addressLine1: z.string().trim().min(3).max(200),
  area: z.string().trim().max(80).optional(),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  pincode: z.string().regex(/^\d{6}$/, 'Enter a valid 6-digit pincode'),
  phone: z.string().trim().max(20).optional(),
  email: z.string().email().optional(),
});

export const clinicUpdateSchema = clinicCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const roleUpdateSchema = z.object({
  role: z.enum(['patient', 'admin', 'receptionist']),
});

export const notificationQuerySchema = paginationSchema.extend({
  unread: z.enum(['true', 'false']).optional(),
});

export const adminIdParamSchema = z.object({ id: uuidSchema });
