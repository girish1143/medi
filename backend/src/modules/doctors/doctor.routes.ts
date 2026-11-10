import type { Prisma, PrismaClient } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { createAuthenticateMiddleware } from '../../middleware/authenticate';
import { authorizePermissions, authorizeRoles } from '../../middleware/authorize';
import { csrfProtection } from '../../middleware/csrf-protection';
import { validateRequest } from '../../middleware/validate-request';
import { PERMISSIONS } from '../../security/permissions';
import { hashRequestFingerprint } from '../../security/token-hash';
import { CONSULTATION_MODES } from '../../shared/constants';
import { NotFoundError } from '../../shared/errors';
import { asyncHandler, buildPaginationMeta, okResponse } from '../../shared/utils';
import { paginationQuerySchema, uuidSchema } from '../../shared/validators';
import { recordAuditLog } from '../audit-logs/audit-log.service';

const listDoctorsQuery = paginationQuerySchema.extend({
  q: z.string().trim().optional(),
  city: z.string().trim().optional(),
  specialization: z.string().trim().optional(),
});

const updateDoctorSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  qualificationSummary: z.string().trim().max(500).nullable().optional(),
  yearsOfExperience: z.number().int().min(0).max(80).optional(),
  consultationMode: z.enum(CONSULTATION_MODES).optional(),
  consultationFeeMinor: z.number().int().min(0).nullable().optional(),
  currency: z.string().trim().length(3).transform((v) => v.toUpperCase()).nullable().optional(),
  isAcceptingLeads: z.boolean().optional(),
  city: z.string().trim().min(2).max(100).optional(),
  stateProvince: z.string().trim().min(2).max(100).optional(),
  bio: z.string().trim().max(2000).nullable().optional(),
});

const idParam = z.object({ id: uuidSchema });

export function createDoctorRoutes(db: PrismaClient = prisma): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(db);

  // Public directory lists verified, non-archived doctors accepting leads (no credentials/secrets exposed)
  router.get(
    '/',
    validateRequest({ query: listDoctorsQuery }),
    asyncHandler(async (req, res) => {
      const query = req.query as unknown as z.infer<typeof listDoctorsQuery>;
      const skip = (query.page - 1) * query.pageSize;

      const where: Prisma.DoctorWhereInput = {
        archivedAt: null,
        verificationStatus: 'VERIFIED',
        ...(query.city ? { city: { contains: query.city } } : {}),
        ...(query.specialization
          ? {
              specializations: {
                some: {
                  OR: [
                    { specializationCode: query.specialization.toUpperCase() },
                    { specializationName: { contains: query.specialization } },
                  ],
                },
              },
            }
          : {}),
        ...(query.q
          ? {
              OR: [
                { city: { contains: query.q } },
                { user: { fullName: { contains: query.q } } },
              ],
            }
          : {}),
      };

      const [total, doctors] = await Promise.all([
        db.doctor.count({ where }),
        db.doctor.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: query.pageSize,
          select: {
            id: true,
            city: true,
            stateProvince: true,
            countryCode: true,
            consultationMode: true,
            consultationFeeMinor: true,
            currency: true,
            yearsOfExperience: true,
            qualificationSummary: true,
            isAcceptingLeads: true,
            bio: true,
            user: { select: { fullName: true } },
            specializations: {
              select: {
                specializationCode: true,
                specializationName: true,
                isPrimary: true,
                boardCertified: true,
              },
            },
            primaryHospital: {
              select: { id: true, displayName: true, city: true },
            },
          },
        }),
      ]);

      return okResponse(res, {
        doctors,
        pagination: buildPaginationMeta(query.page, query.pageSize, total),
      });
    }),
  );

  router.get(
    '/me',
    authenticate,
    authorizeRoles(['DOCTOR'], db),
    asyncHandler(async (req, res) => {
      const doctor = await db.doctor.findUnique({
        where: { userId: req.principal!.userId },
        include: {
          user: { select: { id: true, fullName: true, email: true, phone: true, accountStatus: true } },
          specializations: true,
          primaryHospital: { select: { id: true, displayName: true } },
        },
      });
      if (!doctor || doctor.archivedAt !== null) {
        throw new NotFoundError('DOCTOR_NOT_FOUND', 'Doctor profile not found.');
      }
      return okResponse(res, { doctor });
    }),
  );

  router.patch(
    '/me',
    csrfProtection,
    authenticate,
    authorizeRoles(['DOCTOR'], db),
    validateRequest({ body: updateDoctorSchema }),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof updateDoctorSchema>;
      const principal = req.principal!;
      const existing = await db.doctor.findUnique({ where: { userId: principal.userId } });
      if (!existing || existing.archivedAt !== null) {
        throw new NotFoundError('DOCTOR_NOT_FOUND', 'Doctor profile not found.');
      }

      const doctor = await db.$transaction(async (tx) => {
        if (body.fullName) {
          await tx.user.update({
            where: { id: principal.userId },
            data: { fullName: body.fullName },
          });
        }
        const updated = await tx.doctor.update({
          where: { id: existing.id },
          data: {
            ...(body.qualificationSummary !== undefined ? { qualificationSummary: body.qualificationSummary } : {}),
            ...(body.yearsOfExperience !== undefined ? { yearsOfExperience: body.yearsOfExperience } : {}),
            ...(body.consultationMode !== undefined ? { consultationMode: body.consultationMode } : {}),
            ...(body.consultationFeeMinor !== undefined ? { consultationFeeMinor: body.consultationFeeMinor } : {}),
            ...(body.currency !== undefined ? { currency: body.currency } : {}),
            ...(body.isAcceptingLeads !== undefined ? { isAcceptingLeads: body.isAcceptingLeads } : {}),
            ...(body.city !== undefined ? { city: body.city } : {}),
            ...(body.stateProvince !== undefined ? { stateProvince: body.stateProvince } : {}),
            ...(body.bio !== undefined ? { bio: body.bio } : {}),
          },
          include: { specializations: true },
        });
        await recordAuditLog(
          {
            actorUserId: principal.userId,
            actorRole: principal.role,
            action: 'DOCTOR_SELF_PROFILE_UPDATED',
            resourceType: 'Doctor',
            resourceId: existing.id,
            requestId: res.locals.requestId as string | undefined,
            ipHash: hashRequestFingerprint(req.ip),
            userAgentHash: hashRequestFingerprint(req.header('user-agent')),
          },
          tx,
        );
        return updated;
      });

      return okResponse(res, { doctor });
    }),
  );

  router.get(
    '/:id',
    validateRequest({ params: idParam }),
    asyncHandler(async (req, res) => {
      const doctor = await db.doctor.findFirst({
        where: { id: String(req.params.id), archivedAt: null, verificationStatus: 'VERIFIED' },
        select: {
          id: true,
          city: true,
          stateProvince: true,
          countryCode: true,
          consultationMode: true,
          consultationFeeMinor: true,
          currency: true,
          yearsOfExperience: true,
          qualificationSummary: true,
          bio: true,
          isAcceptingLeads: true,
          user: { select: { fullName: true } },
          specializations: {
            select: { specializationCode: true, specializationName: true, isPrimary: true, boardCertified: true },
          },
          primaryHospital: { select: { id: true, displayName: true, city: true } },
        },
      });
      if (!doctor) {
        throw new NotFoundError('DOCTOR_NOT_FOUND', 'Verified doctor not found.');
      }
      return okResponse(res, { doctor });
    }),
  );

  router.patch(
    '/:id',
    csrfProtection,
    authenticate,
    authorizePermissions([PERMISSIONS.DOCTORS_UPDATE], db),
    validateRequest({ params: idParam, body: updateDoctorSchema }),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof updateDoctorSchema>;
      const existing = await db.doctor.findUnique({ where: { id: String(req.params.id) } });
      if (!existing || existing.archivedAt !== null) {
        throw new NotFoundError('DOCTOR_NOT_FOUND', 'Doctor profile not found.');
      }

      const updated = await db.$transaction(async (tx) => {
        const doc = await tx.doctor.update({
          where: { id: existing.id },
          data: {
            ...(body.qualificationSummary !== undefined ? { qualificationSummary: body.qualificationSummary } : {}),
            ...(body.yearsOfExperience !== undefined ? { yearsOfExperience: body.yearsOfExperience } : {}),
            ...(body.consultationMode !== undefined ? { consultationMode: body.consultationMode } : {}),
            ...(body.isAcceptingLeads !== undefined ? { isAcceptingLeads: body.isAcceptingLeads } : {}),
            ...(body.city !== undefined ? { city: body.city } : {}),
            ...(body.stateProvince !== undefined ? { stateProvince: body.stateProvince } : {}),
            ...(body.bio !== undefined ? { bio: body.bio } : {}),
          },
        });
        await recordAuditLog(
          {
            actorUserId: req.principal!.userId,
            actorRole: req.principal!.role,
            action: 'ADMIN_DOCTOR_UPDATED',
            resourceType: 'Doctor',
            resourceId: existing.id,
          },
          tx,
        );
        return doc;
      });
      return okResponse(res, { doctor: updated });
    }),
  );

  router.delete(
    '/:id',
    csrfProtection,
    authenticate,
    authorizePermissions([PERMISSIONS.DOCTORS_MANAGE], db),
    validateRequest({ params: idParam }),
    asyncHandler(async (req, res) => {
      const existing = await db.doctor.findUnique({ where: { id: String(req.params.id) } });
      if (!existing || existing.archivedAt !== null) {
        throw new NotFoundError('DOCTOR_NOT_FOUND', 'Doctor profile not found.');
      }
      await db.$transaction(async (tx) => {
        await tx.doctor.update({
          where: { id: existing.id },
          data: { archivedAt: new Date(), isAcceptingLeads: false },
        });
        await recordAuditLog(
          {
            actorUserId: req.principal!.userId,
            actorRole: req.principal!.role,
            action: 'DOCTOR_ARCHIVED',
            resourceType: 'Doctor',
            resourceId: existing.id,
          },
          tx,
        );
      });
      return okResponse(res, { archived: true });
    }),
  );

  return router;
}
