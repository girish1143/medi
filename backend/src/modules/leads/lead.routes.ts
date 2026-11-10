import type { PrismaClient } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { createAuthenticateMiddleware } from '../../middleware/authenticate';
import { authorizePermissions, authorizeRoles } from '../../middleware/authorize';
import { csrfProtection } from '../../middleware/csrf-protection';
import { validateRequest } from '../../middleware/validate-request';
import { PERMISSIONS } from '../../security/permissions';
import { hashRequestFingerprint } from '../../security/token-hash';
import {
  CONSULTATION_MODES,
  LEAD_PRIORITIES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  PROVIDER_TYPES,
} from '../../shared/constants';
import { asyncHandler, createdResponse, okResponse } from '../../shared/utils';
import { paginationQuerySchema, uuidSchema } from '../../shared/validators';
import { AssignmentService } from '../assignments/assignment.service';
import { LeadService } from './lead.service';

const createLeadSchema = z.object({
  specialization: z.string().trim().min(2).max(64),
  locationCity: z.string().trim().min(2).max(100),
  locationState: z.string().trim().min(2).max(100),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
  consultationMode: z.enum(CONSULTATION_MODES).default('IN_PERSON'),
  enquiryDescription: z.string().trim().min(10).max(2000),
  leadSource: z.enum(LEAD_SOURCES).optional(),
  priority: z.enum(LEAD_PRIORITIES).optional(),
  idempotencyKey: z.string().trim().min(4).max(100).optional(),
  grantDisclosureConsent: z.boolean().optional(),
  consentVersion: z.string().trim().max(20).optional(),
});

const listLeadsQuery = paginationQuerySchema.extend({
  status: z.enum(LEAD_STATUSES).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(LEAD_STATUSES),
  reason: z.string().trim().max(500).optional(),
});

const assignLeadSchema = z.object({
  providerType: z.enum(PROVIDER_TYPES),
  providerId: uuidSchema,
  matchScore: z.number().min(0).max(100).optional(),
  expiresAt: z.string().datetime().optional(),
});

const idParam = z.object({ id: uuidSchema });

export function createLeadRoutes(db: PrismaClient = prisma): Router {
  const router = Router();
  const leadService = new LeadService(db);
  const assignmentService = new AssignmentService(db);
  const authenticate = createAuthenticateMiddleware(db);

  router.get(
    '/',
    authenticate,
    validateRequest({ query: listLeadsQuery }),
    asyncHandler(async (req, res) => {
      const query = req.query as unknown as z.infer<typeof listLeadsQuery>;
      const result = await leadService.listLeadsForPrincipal(req.principal!, query);
      return okResponse(res, result);
    }),
  );

  router.post(
    '/',
    csrfProtection,
    authenticate,
    authorizeRoles(['PATIENT'], db),
    validateRequest({ body: createLeadSchema }),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof createLeadSchema>;
      const idempotencyKey =
        body.idempotencyKey ?? req.header('idempotency-key') ?? `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const lead = await leadService.createPatientLead({
        actorUserId: req.principal!.userId,
        specialization: body.specialization,
        locationCity: body.locationCity,
        locationState: body.locationState,
        countryCode: body.countryCode,
        consultationMode: body.consultationMode,
        enquiryDescription: body.enquiryDescription,
        leadSource: body.leadSource,
        priority: body.priority,
        idempotencyKey,
        grantDisclosureConsent: body.grantDisclosureConsent,
        consentVersion: body.consentVersion,
        ipHash: hashRequestFingerprint(req.ip),
        userAgentHash: hashRequestFingerprint(req.header('user-agent')),
      });

      return createdResponse(res, { lead });
    }),
  );

  router.get(
    '/:id',
    authenticate,
    validateRequest({ params: idParam }),
    asyncHandler(async (req, res) => {
      const result = await leadService.getLeadDetail(String(req.params.id), req.principal!);
      return okResponse(res, result);
    }),
  );

  const handleStatusPatch = asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof updateStatusSchema>;
    const lead = await leadService.updateLeadStatus({
      leadId: String(req.params.id),
      actor: req.principal!,
      nextStatus: body.status,
      reason: body.reason,
    });
    return okResponse(res, { lead });
  });

  router.patch(
    '/:id',
    csrfProtection,
    authenticate,
    validateRequest({ params: idParam, body: updateStatusSchema }),
    handleStatusPatch,
  );

  router.patch(
    '/:id/status',
    csrfProtection,
    authenticate,
    validateRequest({ params: idParam, body: updateStatusSchema }),
    handleStatusPatch,
  );

  router.post(
    '/:id/assign',
    csrfProtection,
    authenticate,
    authorizePermissions([PERMISSIONS.LEADS_ASSIGN], db),
    validateRequest({ params: idParam, body: assignLeadSchema }),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof assignLeadSchema>;
      const principal = req.principal!;
      const assignment = await assignmentService.assignLeadToProvider({
        actorUserId: principal.userId,
        actorRole: principal.role,
        leadId: String(req.params.id),
        providerType: body.providerType,
        providerId: body.providerId,
        matchScore: body.matchScore,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      });
      return createdResponse(res, { assignment });
    }),
  );

  router.post(
    '/assignments/:id/respond',
    csrfProtection,
    authenticate,
    authorizeRoles(['DOCTOR', 'HOSPITAL'], db),
    validateRequest({
      params: idParam,
      body: z.object({
        decision: z.enum(['ACCEPTED', 'REJECTED']),
        rejectionReason: z.string().trim().max(500).optional(),
      }),
    }),
    asyncHandler(async (req, res) => {
      const body = req.body as { decision: 'ACCEPTED' | 'REJECTED'; rejectionReason?: string };
      const assignment = await assignmentService.respondToAssignment({
        assignmentId: String(req.params.id),
        actorUserId: req.principal!.userId,
        actorRole: req.principal!.role as 'DOCTOR' | 'HOSPITAL',
        decision: body.decision,
        rejectionReason: body.rejectionReason,
      });
      return okResponse(res, { assignment });
    }),
  );

  return router;
}
