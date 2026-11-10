import type { PrismaClient } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../../config/database';
import { asyncHandler, okResponse } from '../../shared/utils';

export function createSpecializationRoutes(db: PrismaClient = prisma): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const [doctorSpecs, hospitalDepts] = await Promise.all([
        db.doctorSpecialization.findMany({
          where: { doctor: { archivedAt: null, verificationStatus: 'VERIFIED' } },
          select: { specializationCode: true, specializationName: true, doctorId: true },
        }),
        db.hospitalDepartment.findMany({
          where: {
            isActive: true,
            hospital: { archivedAt: null, verificationStatus: 'VERIFIED' },
          },
          select: { specializationCode: true, specializationName: true, hospitalId: true },
        }),
      ]);

      const map = new Map<
        string,
        { code: string; name: string; doctorCount: number; hospitalCount: number }
      >();

      for (const spec of doctorSpecs) {
        const entry = map.get(spec.specializationCode) ?? {
          code: spec.specializationCode,
          name: spec.specializationName,
          doctorCount: 0,
          hospitalCount: 0,
        };
        entry.doctorCount += 1;
        map.set(spec.specializationCode, entry);
      }

      for (const dept of hospitalDepts) {
        const entry = map.get(dept.specializationCode) ?? {
          code: dept.specializationCode,
          name: dept.specializationName,
          doctorCount: 0,
          hospitalCount: 0,
        };
        entry.hospitalCount += 1;
        map.set(dept.specializationCode, entry);
      }

      return okResponse(res, {
        specializations: Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name)),
      });
    }),
  );

  return router;
}
