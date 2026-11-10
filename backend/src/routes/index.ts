import type { PrismaClient } from '@prisma/client';
import { Router } from 'express';
import { prisma, verifyDatabaseConnection } from '../config/database';
import { createAdminRoutes } from '../modules/admin/admin.routes';
import { createAppointmentRoutes } from '../modules/appointments/appointment.routes';
import { createAssignmentRoutes } from '../modules/assignments/assignment.routes';
import { createAuthRoutes } from '../modules/auth/auth.routes';
import type { TokenDispatcher } from '../modules/auth/auth.service';
import { createConsentRoutes } from '../modules/consent/consent.routes';
import { createContactRequestRoutes } from '../modules/contact-requests/contact-request.routes';
import { createDoctorRoutes } from '../modules/doctors/doctor.routes';
import { createHospitalRoutes } from '../modules/hospitals/hospital.routes';
import { createLeadRoutes } from '../modules/leads/lead.routes';
import { createPatientRoutes } from '../modules/patients/patient.routes';
import { createPermissionRoutes } from '../modules/permissions/permission.routes';
import { createSpecializationRoutes } from '../modules/specializations/specialization.routes';
import { createUserRoutes } from '../modules/users/user.routes';
import { asyncHandler, okResponse } from '../shared/utils';

export interface RouterDeps {
  db?: PrismaClient;
  dispatchToken?: TokenDispatcher;
}

export function createApiV1Router(deps: RouterDeps | PrismaClient = prisma): Router {
  const isClient = deps && typeof (deps as PrismaClient).$connect === 'function';
  const db: PrismaClient = isClient ? (deps as PrismaClient) : ((deps as RouterDeps).db ?? prisma);
  const dispatchToken = isClient ? undefined : (deps as RouterDeps).dispatchToken;

  const router = Router();

  router.get(
    '/health',
    asyncHandler(async (_req, res) => {
      const dbOk = await verifyDatabaseConnection(db);
      return okResponse(
        res,
        {
          status: dbOk ? 'ok' : 'degraded',
          service: 'hospital-platform-backend',
          version: 'v1',
          database: dbOk ? 'connected' : 'disconnected',
          timestamp: new Date().toISOString(),
        },
        dbOk ? 200 : 503,
      );
    }),
  );

  router.use('/auth', createAuthRoutes(db, dispatchToken));
  router.use('/users', createUserRoutes(db));
  router.use('/', createPermissionRoutes(db));
  router.use('/patients', createPatientRoutes(db));
  router.use('/doctors', createDoctorRoutes(db));
  router.use('/hospitals', createHospitalRoutes(db));
  router.use('/specializations', createSpecializationRoutes(db));
  router.use('/leads', createLeadRoutes(db));
  router.use('/assignments', createAssignmentRoutes(db));
  router.use('/consents', createConsentRoutes(db));
  router.use('/consent', createConsentRoutes(db));
  router.use('/appointments', createAppointmentRoutes(db));
  router.use('/contact-requests', createContactRequestRoutes(db));
  router.use('/admin', createAdminRoutes(db));

  return router;
}
