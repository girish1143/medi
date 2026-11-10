import type { PrismaClient } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { createAuthenticateMiddleware } from '../../middleware/authenticate';
import { authorizeRoles } from '../../middleware/authorize';
import { csrfProtection } from '../../middleware/csrf-protection';
import { validateRequest } from '../../middleware/validate-request';
import { hashRequestFingerprint } from '../../security/token-hash';
import { CONSENT_PROVIDER_SCOPES, CONSENT_PURPOSES, isAdminRole } from '../../shared/constants';
import { ForbiddenError, NotFoundError } from '../../shared/errors';
import { asyncHandler, createdResponse, okResponse } from '../../shared/utils';
import { uuidSchema } from '../../shared/validators';
import { ConsentService } from './consent.service';

const grantConsentSchema = z.object({
  leadId: uuidSchema,
  consentPurpose: z.enum(CONSENT_PURPOSES).default('PROVIDER_CONTACT_DISCLOSURE'),
  authorizedProviderScope: z.enum(CONSENT_PROVIDER_SCOPES).default('MATCHED_PROVIDERS'),
  authorizedDoctorId: uuidSchema.optional(),
  authorizedHospitalId: uuidSchema.optional(),
  consentVersion: z.string().trim().min(1).max(20).default('v1.0'),
  expiresAt: z.string().datetime().optional(),
});

const revokeConsentSchema = z.object({
  revocationReason: z.string().trim().min(3).max(500),
});

const idParam = z.object({ id: uuidSchema });
const leadIdParam = z.object({ leadId: uuidSchema });

export function createConsentRoutes(db: PrismaClient = prisma): Router {
  const router = Router();
  const service = new ConsentService(db);
  const authenticate = createAuthenticateMiddleware(db);

  router.get(
    '/',
    authenticate,
    authorizeRoles(['PATIENT'], db),
    asyncHandler(async (req, res) => {
      const patient = await db.patient.findUnique({ where: { userId: req.principal!.userId } });
      if (!patient) {
        throw new NotFoundError('PATIENT_NOT_FOUND', 'Patient profile not found.');
      }
      const consents = await db.patientConsent.findMany({
        where: { patientId: patient.id },
        orderBy: { grantedAt: 'desc' },
      });
      return okResponse(res, { consents });
    }),
  );

  router.get(
    '/:leadId',
    authenticate,
    validateRequest({ params: leadIdParam }),
    asyncHandler(async (req, res) => {
      const principal = req.principal!;
      const leadId = String(req.params.leadId);

      if (principal.role === 'PATIENT') {
        const patient = await db.patient.findUnique({ where: { userId: principal.userId } });
        const lead = patient
          ? await db.lead.findFirst({ where: { id: leadId, patientId: patient.id } })
          : null;
        if (!lead) {
          throw new ForbiddenError('FORBIDDEN_RESOURCE_OWNERSHIP', 'Cannot view consent for another patient lead.');
        }
      } else if (!isAdminRole(principal.role)) {
        throw new ForbiddenError('FORBIDDEN_ROLE', 'Only the owning patient or authorized admin may inspect consent records.');
      }

      const consents = await db.patientConsent.findMany({
        where: { leadId },
        orderBy: { grantedAt: 'desc' },
      });
      return okResponse(res, { consents });
    }),
  );

  router.post(
    '/',
    csrfProtection,
    authenticate,
    authorizeRoles(['PATIENT'], db),
    validateRequest({ body: grantConsentSchema }),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof grantConsentSchema>;
      const patient = await db.patient.findUnique({ where: { userId: req.principal!.userId } });
      if (!patient) {
        throw new NotFoundError('PATIENT_NOT_FOUND', 'Patient profile not found.');
      }
      const consent = await service.grantConsent({
        actorUserId: req.principal!.userId,
        patientId: patient.id,
        leadId: body.leadId,
        consentPurpose: body.consentPurpose,
        authorizedProviderScope: body.authorizedProviderScope,
        authorizedDoctorId: body.authorizedDoctorId,
        authorizedHospitalId: body.authorizedHospitalId,
        consentVersion: body.consentVersion,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
        ipHash: hashRequestFingerprint(req.ip),
        userAgentHash: hashRequestFingerprint(req.header('user-agent')),
      });
      return createdResponse(res, { consent });
    }),
  );

  router.post(
    '/:id/revoke',
    csrfProtection,
    authenticate,
    authorizeRoles(['PATIENT'], db),
    validateRequest({ params: idParam, body: revokeConsentSchema }),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof revokeConsentSchema>;
      const patient = await db.patient.findUnique({ where: { userId: req.principal!.userId } });
      if (!patient) {
        throw new NotFoundError('PATIENT_NOT_FOUND', 'Patient profile not found.');
      }
      const consent = await service.revokeConsent({
        actorUserId: req.principal!.userId,
        patientId: patient.id,
        consentId: String(req.params.id),
        revocationReason: body.revocationReason,
      });
      return okResponse(res, { consent });
    }),
  );

  return router;
}
