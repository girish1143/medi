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
import { NotFoundError } from '../../shared/errors';
import { asyncHandler, buildPaginationMeta, okResponse } from '../../shared/utils';
import { paginationQuerySchema } from '../../shared/validators';
import { recordAuditLog } from '../audit-logs/audit-log.service';

const updatePatientMeSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  preferredLanguage: z.string().trim().min(2).max(16).optional(),
  city: z.string().trim().max(100).nullable().optional(),
  stateProvince: z.string().trim().max(100).nullable().optional(),
  postalCode: z.string().trim().max(20).nullable().optional(),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).nullable().optional(),
  emergencyContactName: z.string().trim().max(120).nullable().optional(),
  emergencyContactPhone: z.string().trim().max(20).nullable().optional(),
});

export function createPatientRoutes(db: PrismaClient = prisma): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(db);

  router.get(
    '/',
    authenticate,
    authorizePermissions([PERMISSIONS.PATIENTS_READ], db),
    validateRequest({ query: paginationQuerySchema }),
    asyncHandler(async (req, res) => {
      const { page, pageSize } = req.query as unknown as z.infer<typeof paginationQuerySchema>;
      const skip = (page - 1) * pageSize;

      const [total, patients] = await Promise.all([
        db.patient.count({ where: { archivedAt: null } }),
        db.patient.findMany({
          where: { archivedAt: null },
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
          select: {
            id: true,
            userId: true,
            preferredLanguage: true,
            city: true,
            stateProvince: true,
            countryCode: true,
            createdAt: true,
            user: {
              select: { id: true, fullName: true, email: true, accountStatus: true },
            },
          },
        }),
      ]);

      return okResponse(res, {
        patients,
        pagination: buildPaginationMeta(page, pageSize, total),
      });
    }),
  );

  router.get(
    '/me',
    authenticate,
    authorizeRoles(['PATIENT'], db),
    asyncHandler(async (req, res) => {
      const patient = await db.patient.findUnique({
        where: { userId: req.principal!.userId },
        include: {
          user: {
            select: { id: true, email: true, phone: true, fullName: true, accountStatus: true },
          },
        },
      });
      if (!patient || patient.archivedAt !== null) {
        throw new NotFoundError('PATIENT_NOT_FOUND', 'Patient profile not found.');
      }
      return okResponse(res, { patient });
    }),
  );

  router.patch(
    '/me',
    csrfProtection,
    authenticate,
    authorizeRoles(['PATIENT'], db),
    validateRequest({ body: updatePatientMeSchema }),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof updatePatientMeSchema>;
      const principal = req.principal!;
      const existing = await db.patient.findUnique({ where: { userId: principal.userId } });
      if (!existing || existing.archivedAt !== null) {
        throw new NotFoundError('PATIENT_NOT_FOUND', 'Patient profile not found.');
      }

      const updated = await db.$transaction(async (tx) => {
        if (body.fullName) {
          await tx.user.update({
            where: { id: principal.userId },
            data: { fullName: body.fullName },
          });
        }
        const patient = await tx.patient.update({
          where: { id: existing.id },
          data: {
            ...(body.preferredLanguage !== undefined ? { preferredLanguage: body.preferredLanguage } : {}),
            ...(body.city !== undefined ? { city: body.city } : {}),
            ...(body.stateProvince !== undefined ? { stateProvince: body.stateProvince } : {}),
            ...(body.postalCode !== undefined ? { postalCode: body.postalCode } : {}),
            ...(body.countryCode !== undefined ? { countryCode: body.countryCode } : {}),
            ...(body.emergencyContactName !== undefined ? { emergencyContactName: body.emergencyContactName } : {}),
            ...(body.emergencyContactPhone !== undefined ? { emergencyContactPhone: body.emergencyContactPhone } : {}),
          },
          include: {
            user: { select: { id: true, email: true, phone: true, fullName: true } },
          },
        });
        await recordAuditLog(
          {
            actorUserId: principal.userId,
            actorRole: principal.role,
            action: 'PATIENT_PROFILE_UPDATED',
            resourceType: 'Patient',
            resourceId: existing.id,
            requestId: res.locals.requestId as string | undefined,
            ipHash: hashRequestFingerprint(req.ip),
            userAgentHash: hashRequestFingerprint(req.header('user-agent')),
          },
          tx,
        );
        return patient;
      });

      return okResponse(res, { patient: updated });
    }),
  );

  return router;
}
