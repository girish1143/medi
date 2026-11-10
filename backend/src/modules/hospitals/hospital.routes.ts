import type { Prisma, PrismaClient } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { createAuthenticateMiddleware } from '../../middleware/authenticate';
import { authorizePermissions, authorizeRoles } from '../../middleware/authorize';
import { csrfProtection } from '../../middleware/csrf-protection';
import { validateRequest } from '../../middleware/validate-request';
import { PERMISSIONS } from '../../security/permissions';
import { NotFoundError } from '../../shared/errors';
import { asyncHandler, buildPaginationMeta, okResponse } from '../../shared/utils';
import { paginationQuerySchema, uuidSchema } from '../../shared/validators';
import { recordAuditLog } from '../audit-logs/audit-log.service';

const listHospitalsQuery = paginationQuerySchema.extend({
  q: z.string().trim().optional(),
  city: z.string().trim().optional(),
  specialization: z.string().trim().optional(),
});

const updateHospitalSchema = z.object({
  displayName: z.string().trim().min(2).max(160).optional(),
  offersTeleconsultation: z.boolean().optional(),
  isAcceptingLeads: z.boolean().optional(),
  addressLine1: z.string().trim().min(5).max(200).optional(),
  city: z.string().trim().min(2).max(100).optional(),
  stateProvince: z.string().trim().min(2).max(100).optional(),
  postalCode: z.string().trim().min(3).max(20).optional(),
  websiteUrl: z.string().url().nullable().optional(),
  bedCapacity: z.number().int().min(0).nullable().optional(),
});

const idParam = z.object({ id: uuidSchema });

export function createHospitalRoutes(db: PrismaClient = prisma): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(db);

  router.get(
    '/',
    validateRequest({ query: listHospitalsQuery }),
    asyncHandler(async (req, res) => {
      const query = req.query as unknown as z.infer<typeof listHospitalsQuery>;
      const skip = (query.page - 1) * query.pageSize;

      const where: Prisma.HospitalWhereInput = {
        archivedAt: null,
        verificationStatus: 'VERIFIED',
        ...(query.city ? { city: { contains: query.city } } : {}),
        ...(query.specialization
          ? {
              departments: {
                some: {
                  isActive: true,
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
                { displayName: { contains: query.q } },
                { legalName: { contains: query.q } },
                { city: { contains: query.q } },
              ],
            }
          : {}),
      };

      const [total, hospitals] = await Promise.all([
        db.hospital.count({ where }),
        db.hospital.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: query.pageSize,
          select: {
            id: true,
            displayName: true,
            city: true,
            stateProvince: true,
            countryCode: true,
            offersTeleconsultation: true,
            isAcceptingLeads: true,
            bedCapacity: true,
            websiteUrl: true,
            departments: {
              where: { isActive: true },
              select: { id: true, name: true, specializationCode: true, specializationName: true },
            },
          },
        }),
      ]);

      return okResponse(res, {
        hospitals,
        pagination: buildPaginationMeta(query.page, query.pageSize, total),
      });
    }),
  );

  router.get(
    '/me',
    authenticate,
    authorizeRoles(['HOSPITAL'], db),
    asyncHandler(async (req, res) => {
      const hospital = await db.hospital.findUnique({
        where: { userId: req.principal!.userId },
        include: {
          user: { select: { id: true, email: true, phone: true, accountStatus: true } },
          departments: true,
        },
      });
      if (!hospital || hospital.archivedAt !== null) {
        throw new NotFoundError('HOSPITAL_NOT_FOUND', 'Hospital profile not found.');
      }
      return okResponse(res, { hospital });
    }),
  );

  router.patch(
    '/me',
    csrfProtection,
    authenticate,
    authorizeRoles(['HOSPITAL'], db),
    validateRequest({ body: updateHospitalSchema }),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof updateHospitalSchema>;
      const existing = await db.hospital.findUnique({ where: { userId: req.principal!.userId } });
      if (!existing || existing.archivedAt !== null) {
        throw new NotFoundError('HOSPITAL_NOT_FOUND', 'Hospital profile not found.');
      }

      const hospital = await db.$transaction(async (tx) => {
        const updated = await tx.hospital.update({
          where: { id: existing.id },
          data: {
            ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
            ...(body.offersTeleconsultation !== undefined ? { offersTeleconsultation: body.offersTeleconsultation } : {}),
            ...(body.isAcceptingLeads !== undefined ? { isAcceptingLeads: body.isAcceptingLeads } : {}),
            ...(body.addressLine1 !== undefined ? { addressLine1: body.addressLine1 } : {}),
            ...(body.city !== undefined ? { city: body.city } : {}),
            ...(body.stateProvince !== undefined ? { stateProvince: body.stateProvince } : {}),
            ...(body.postalCode !== undefined ? { postalCode: body.postalCode } : {}),
            ...(body.websiteUrl !== undefined ? { websiteUrl: body.websiteUrl } : {}),
            ...(body.bedCapacity !== undefined ? { bedCapacity: body.bedCapacity } : {}),
          },
          include: { departments: true },
        });
        await recordAuditLog(
          {
            actorUserId: req.principal!.userId,
            actorRole: req.principal!.role,
            action: 'HOSPITAL_SELF_PROFILE_UPDATED',
            resourceType: 'Hospital',
            resourceId: existing.id,
          },
          tx,
        );
        return updated;
      });

      return okResponse(res, { hospital });
    }),
  );

  router.get(
    '/:id',
    validateRequest({ params: idParam }),
    asyncHandler(async (req, res) => {
      const hospital = await db.hospital.findFirst({
        where: { id: String(req.params.id), archivedAt: null, verificationStatus: 'VERIFIED' },
        select: {
          id: true,
          displayName: true,
          city: true,
          stateProvince: true,
          countryCode: true,
          offersTeleconsultation: true,
          isAcceptingLeads: true,
          bedCapacity: true,
          websiteUrl: true,
          departments: {
            where: { isActive: true },
            select: { id: true, name: true, specializationCode: true, specializationName: true },
          },
        },
      });
      if (!hospital) {
        throw new NotFoundError('HOSPITAL_NOT_FOUND', 'Verified hospital not found.');
      }
      return okResponse(res, { hospital });
    }),
  );

  router.patch(
    '/:id',
    csrfProtection,
    authenticate,
    authorizePermissions([PERMISSIONS.HOSPITALS_UPDATE], db),
    validateRequest({ params: idParam, body: updateHospitalSchema }),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof updateHospitalSchema>;
      const existing = await db.hospital.findUnique({ where: { id: String(req.params.id) } });
      if (!existing || existing.archivedAt !== null) {
        throw new NotFoundError('HOSPITAL_NOT_FOUND', 'Hospital profile not found.');
      }

      const updated = await db.$transaction(async (tx) => {
        const hosp = await tx.hospital.update({
          where: { id: existing.id },
          data: {
            ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
            ...(body.offersTeleconsultation !== undefined ? { offersTeleconsultation: body.offersTeleconsultation } : {}),
            ...(body.isAcceptingLeads !== undefined ? { isAcceptingLeads: body.isAcceptingLeads } : {}),
            ...(body.addressLine1 !== undefined ? { addressLine1: body.addressLine1 } : {}),
            ...(body.city !== undefined ? { city: body.city } : {}),
            ...(body.stateProvince !== undefined ? { stateProvince: body.stateProvince } : {}),
            ...(body.postalCode !== undefined ? { postalCode: body.postalCode } : {}),
            ...(body.websiteUrl !== undefined ? { websiteUrl: body.websiteUrl } : {}),
            ...(body.bedCapacity !== undefined ? { bedCapacity: body.bedCapacity } : {}),
          },
        });
        await recordAuditLog(
          {
            actorUserId: req.principal!.userId,
            actorRole: req.principal!.role,
            action: 'ADMIN_HOSPITAL_UPDATED',
            resourceType: 'Hospital',
            resourceId: existing.id,
          },
          tx,
        );
        return hosp;
      });
      return okResponse(res, { hospital: updated });
    }),
  );

  router.delete(
    '/:id',
    csrfProtection,
    authenticate,
    authorizePermissions([PERMISSIONS.HOSPITALS_MANAGE], db),
    validateRequest({ params: idParam }),
    asyncHandler(async (req, res) => {
      const existing = await db.hospital.findUnique({ where: { id: String(req.params.id) } });
      if (!existing || existing.archivedAt !== null) {
        throw new NotFoundError('HOSPITAL_NOT_FOUND', 'Hospital profile not found.');
      }
      await db.$transaction(async (tx) => {
        await tx.hospital.update({
          where: { id: existing.id },
          data: { archivedAt: new Date(), isAcceptingLeads: false },
        });
        await recordAuditLog(
          {
            actorUserId: req.principal!.userId,
            actorRole: req.principal!.role,
            action: 'HOSPITAL_ARCHIVED',
            resourceType: 'Hospital',
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
