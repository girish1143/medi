import type { PrismaClient } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { createAuthenticateMiddleware } from '../../middleware/authenticate';
import { authorizeRoles } from '../../middleware/authorize';
import { csrfProtection } from '../../middleware/csrf-protection';
import { validateRequest } from '../../middleware/validate-request';
import { PERMISSIONS } from '../../security/permissions';
import { APPOINTMENT_STATUSES, isAdminRole } from '../../shared/constants';
import { ForbiddenError, NotFoundError } from '../../shared/errors';
import { asyncHandler, createdResponse, okResponse } from '../../shared/utils';
import { uuidSchema } from '../../shared/validators';
import { recordAuditLog } from '../audit-logs/audit-log.service';

const createAppointmentSchema = z.object({
  doctorId: uuidSchema.optional(),
  hospitalId: uuidSchema.optional(),
  leadId: uuidSchema.optional(),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().min(10).max(240).default(30),
  consultationMode: z.enum(['IN_PERSON', 'TELECONSULTATION']).default('IN_PERSON'),
  notes: z.string().trim().max(500).optional(),
});

const patchAppointmentSchema = z.object({
  status: z.enum(APPOINTMENT_STATUSES),
  cancellationReason: z.string().trim().max(500).optional(),
});

const idParam = z.object({ id: uuidSchema });

export function createAppointmentRoutes(db: PrismaClient = prisma): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(db);

  router.get(
    '/',
    authenticate,
    asyncHandler(async (req, res) => {
      const principal = req.principal!;
      if (principal.role === 'PATIENT') {
        const patient = await db.patient.findUnique({ where: { userId: principal.userId } });
        const appointments = patient
          ? await db.appointment.findMany({
              where: { patientId: patient.id },
              orderBy: { scheduledAt: 'desc' },
            })
          : [];
        return okResponse(res, { appointments });
      }
      if (principal.role === 'DOCTOR') {
        const doctor = await db.doctor.findUnique({ where: { userId: principal.userId } });
        const appointments = doctor
          ? await db.appointment.findMany({
              where: { doctorId: doctor.id },
              orderBy: { scheduledAt: 'desc' },
            })
          : [];
        return okResponse(res, { appointments });
      }
      if (principal.role === 'HOSPITAL') {
        const hospital = await db.hospital.findUnique({ where: { userId: principal.userId } });
        const appointments = hospital
          ? await db.appointment.findMany({
              where: { hospitalId: hospital.id },
              orderBy: { scheduledAt: 'desc' },
            })
          : [];
        return okResponse(res, { appointments });
      }
      if (!isAdminRole(principal.role) || !principal.permissions.includes(PERMISSIONS.LEADS_READ)) {
        throw new ForbiddenError('FORBIDDEN', 'Unauthorized to view appointments.');
      }
      const appointments = await db.appointment.findMany({
        orderBy: { scheduledAt: 'desc' },
        take: 100,
      });
      return okResponse(res, { appointments });
    }),
  );

  router.post(
    '/',
    csrfProtection,
    authenticate,
    authorizeRoles(['PATIENT'], db),
    validateRequest({ body: createAppointmentSchema }),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof createAppointmentSchema>;
      if (Boolean(body.doctorId) === Boolean(body.hospitalId)) {
        throw new ForbiddenError('INVALID_PROVIDER_TARGET', 'Specify exactly one of doctorId or hospitalId.');
      }
      const patient = await db.patient.findUnique({ where: { userId: req.principal!.userId } });
      if (!patient) throw new NotFoundError('PATIENT_NOT_FOUND', 'Patient profile not found.');

      const appointment = await db.$transaction(async (tx) => {
        const created = await tx.appointment.create({
          data: {
            patientId: patient.id,
            doctorId: body.doctorId ?? null,
            hospitalId: body.hospitalId ?? null,
            leadId: body.leadId ?? null,
            scheduledAt: new Date(body.scheduledAt),
            durationMinutes: body.durationMinutes,
            consultationMode: body.consultationMode,
            notes: body.notes ?? null,
          },
        });
        await recordAuditLog(
          {
            actorUserId: req.principal!.userId,
            actorRole: 'PATIENT',
            action: 'APPOINTMENT_REQUESTED',
            resourceType: 'Appointment',
            resourceId: created.id,
          },
          tx,
        );
        return created;
      });
      return createdResponse(res, { appointment });
    }),
  );

  router.patch(
    '/:id',
    csrfProtection,
    authenticate,
    validateRequest({ params: idParam, body: patchAppointmentSchema }),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof patchAppointmentSchema>;
      const existing = await db.appointment.findUnique({ where: { id: String(req.params.id) } });
      if (!existing) throw new NotFoundError('APPOINTMENT_NOT_FOUND', 'Appointment not found.');

      const principal = req.principal!;
      let authorized = isAdminRole(principal.role);
      if (principal.role === 'PATIENT') {
        const p = await db.patient.findUnique({ where: { userId: principal.userId } });
        authorized = p?.id === existing.patientId && body.status === 'CANCELLED';
      } else if (principal.role === 'DOCTOR') {
        const d = await db.doctor.findUnique({ where: { userId: principal.userId } });
        authorized = d?.id === existing.doctorId;
      } else if (principal.role === 'HOSPITAL') {
        const h = await db.hospital.findUnique({ where: { userId: principal.userId } });
        authorized = h?.id === existing.hospitalId;
      }

      if (!authorized) {
        throw new ForbiddenError('FORBIDDEN_OWNERSHIP', 'Not authorized to update this appointment.');
      }

      const appointment = await db.appointment.update({
        where: { id: existing.id },
        data: {
          status: body.status,
          ...(body.status === 'CANCELLED'
            ? { cancelledAt: new Date(), cancellationReason: body.cancellationReason ?? null }
            : {}),
        },
      });
      return okResponse(res, { appointment });
    }),
  );

  return router;
}
