import type { PrismaClient } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { createAuthenticateMiddleware } from '../../middleware/authenticate';
import { authorizeRoles } from '../../middleware/authorize';
import { csrfProtection } from '../../middleware/csrf-protection';
import { validateRequest } from '../../middleware/validate-request';
import { PERMISSIONS } from '../../security/permissions';
import { isAdminRole } from '../../shared/constants';
import { ConsentRequiredError, ForbiddenError, NotFoundError } from '../../shared/errors';
import { asyncHandler, createdResponse, okResponse } from '../../shared/utils';
import { uuidSchema } from '../../shared/validators';
import { recordAuditLog } from '../audit-logs/audit-log.service';

const createContactRequestSchema = z.object({
  leadId: uuidSchema.optional(),
  doctorId: uuidSchema.optional(),
  hospitalId: uuidSchema.optional(),
  consentId: uuidSchema,
  preferredChannel: z.enum(['PHONE', 'EMAIL', 'WHATSAPP', 'VIDEO']).default('PHONE'),
  preferredTimeWindow: z.string().trim().max(120).optional(),
  message: z.string().trim().max(500).optional(),
});

export function createContactRequestRoutes(db: PrismaClient = prisma): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(db);

  router.get(
    '/',
    authenticate,
    asyncHandler(async (req, res) => {
      const principal = req.principal!;
      if (principal.role === 'PATIENT') {
        const patient = await db.patient.findUnique({ where: { userId: principal.userId } });
        const contactRequests = patient
          ? await db.contactRequest.findMany({
              where: { patientId: patient.id },
              orderBy: { createdAt: 'desc' },
            })
          : [];
        return okResponse(res, { contactRequests });
      }
      if (!isAdminRole(principal.role) || !principal.permissions.includes(PERMISSIONS.LEADS_READ)) {
        throw new ForbiddenError('FORBIDDEN', 'Unauthorized to list contact requests.');
      }
      const contactRequests = await db.contactRequest.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return okResponse(res, { contactRequests });
    }),
  );

  router.post(
    '/',
    csrfProtection,
    authenticate,
    authorizeRoles(['PATIENT'], db),
    validateRequest({ body: createContactRequestSchema }),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof createContactRequestSchema>;
      if (Boolean(body.doctorId) === Boolean(body.hospitalId)) {
        throw new ForbiddenError('INVALID_PROVIDER_TARGET', 'Specify exactly one of doctorId or hospitalId.');
      }
      const patient = await db.patient.findUnique({ where: { userId: req.principal!.userId } });
      if (!patient) throw new NotFoundError('PATIENT_NOT_FOUND', 'Patient profile not found.');

      const consent = await db.patientConsent.findFirst({
        where: {
          id: body.consentId,
          patientId: patient.id,
          status: 'GRANTED',
          revokedAt: null,
        },
      });
      if (!consent) {
        throw new ConsentRequiredError('Active granted PatientConsent record is required.');
      }

      const contactRequest = await db.$transaction(async (tx) => {
        const created = await tx.contactRequest.create({
          data: {
            patientId: patient.id,
            leadId: body.leadId ?? null,
            doctorId: body.doctorId ?? null,
            hospitalId: body.hospitalId ?? null,
            consentId: consent.id,
            preferredChannel: body.preferredChannel,
            preferredTimeWindow: body.preferredTimeWindow ?? null,
            message: body.message ?? null,
          },
        });
        await recordAuditLog(
          {
            actorUserId: req.principal!.userId,
            actorRole: 'PATIENT',
            action: 'CONTACT_REQUEST_CREATED',
            resourceType: 'ContactRequest',
            resourceId: created.id,
          },
          tx,
        );
        return created;
      });
      return createdResponse(res, { contactRequest });
    }),
  );

  return router;
}
