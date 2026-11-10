import type { PrismaClient } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { createAuthenticateMiddleware } from '../../middleware/authenticate';
import { authorizePermissions } from '../../middleware/authorize';
import { csrfProtection } from '../../middleware/csrf-protection';
import { validateRequest } from '../../middleware/validate-request';
import { PERMISSIONS } from '../../security/permissions';
import {
  ACCOUNT_STATUSES,
  LEAD_PRIORITIES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  USER_ROLES,
  VERIFICATION_STATUSES,
  type AccountStatus,
} from '../../shared/constants';
import { ConflictError, ConsentRequiredError, ForbiddenError, NotFoundError } from '../../shared/errors';
import { asyncHandler, okResponse } from '../../shared/utils';
import { uuidSchema } from '../../shared/validators';
import { AssignmentService } from '../assignments/assignment.service';
import { createAuditLogAdminRoutes } from '../audit-logs/audit-log.routes';
import { recordAuditLog } from '../audit-logs/audit-log.service';
import { createNotificationAdminRoutes } from '../notifications/notification.routes';
import { createPaymentAdminRoutes } from '../payments/payment.routes';
import { createSubscriptionAdminRoutes } from '../subscriptions/subscription.routes';
import { UserService } from '../users/user.service';
import {
  buildAnalyticsCsv,
  getAdminAnalyticsData,
  parseDateRangeQuery,
} from './analytics.service';
import { findEligibleProvidersForLead } from './matching.service';
import { createAdminSupportAndSettingsRoutes } from './support-settings.routes';

const idParam = z.object({ id: uuidSchema });

export function createAdminRoutes(db: PrismaClient = prisma): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(db);
  const userService = new UserService(db);
  const assignmentService = new AssignmentService(db);

  // Dashboard & Analytics
  router.get(
    '/dashboard',
    authenticate,
    authorizePermissions([PERMISSIONS.ANALYTICS_READ], db),
    asyncHandler(async (req, res) => {
      const range = parseDateRangeQuery(req.query as Record<string, unknown>);
      const data = await getAdminAnalyticsData(range, db);
      return okResponse(res, data);
    }),
  );

  router.get(
    '/analytics',
    authenticate,
    authorizePermissions([PERMISSIONS.ANALYTICS_READ], db),
    asyncHandler(async (req, res) => {
      const range = parseDateRangeQuery(req.query as Record<string, unknown>);
      const data = await getAdminAnalyticsData(range, db);
      return okResponse(res, data);
    }),
  );

  router.get(
    '/analytics/export',
    authenticate,
    authorizePermissions([PERMISSIONS.ANALYTICS_READ], db),
    asyncHandler(async (req, res) => {
      const report = String(req.query.report ?? 'leads');
      const range = parseDateRangeQuery(req.query as Record<string, unknown>);
      const data = await getAdminAnalyticsData(range, db);
      const { filename, csv } = buildAnalyticsCsv(report, data);

      await recordAuditLog(
        {
          actorUserId: req.principal!.userId,
          actorRole: req.principal!.role,
          action: 'ANALYTICS_CSV_EXPORTED',
          resourceType: 'AnalyticsReport',
          metadata: { report },
        },
        db,
      );

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(csv);
    }),
  );

  // Admin Users mirror endpoints
  router.get(
    '/users',
    authenticate,
    authorizePermissions([PERMISSIONS.USERS_READ], db),
    asyncHandler(async (req, res) => {
      const q = String(req.query.q ?? '').trim();
      const role = String(req.query.role ?? '').trim();
      const status = String(req.query.status ?? '').trim();
      const page = Math.max(1, Number(req.query.page ?? '1') || 1);
      const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize ?? '15') || 15));

      const result = await userService.listUsers({
        q: q || undefined,
        role: role && (USER_ROLES as readonly string[]).includes(role) ? role : undefined,
        status: status && (ACCOUNT_STATUSES as readonly string[]).includes(status) ? status : undefined,
        page,
        pageSize,
      });

      return okResponse(res, { users: result.users, pagination: { page, pageSize, total: result.pagination.total } });
    }),
  );

  router.post(
    '/users',
    csrfProtection,
    authenticate,
    authorizePermissions([PERMISSIONS.USERS_UPDATE], db),
    asyncHandler(async (req, res) => {
      const user = await userService.createAdminUser(
        { userId: req.principal!.userId, role: req.principal!.role },
        req.body,
      );
      return okResponse(res, { user }, 201);
    }),
  );

  router.get(
    '/users/:id',
    authenticate,
    authorizePermissions([PERMISSIONS.USERS_READ], db),
    validateRequest({ params: idParam }),
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const [user, auditLogs] = await Promise.all([
        userService.getUserById(id),
        db.auditLog.findMany({
          where: { OR: [{ actorUserId: id }, { resourceId: id }] },
          orderBy: { createdAt: 'desc' },
          take: 25,
        }),
      ]);
      return okResponse(res, { user, auditLogs });
    }),
  );

  router.patch(
    '/users/:id/status',
    csrfProtection,
    authenticate,
    authorizePermissions([PERMISSIONS.USERS_SUSPEND], db),
    validateRequest({ params: idParam }),
    asyncHandler(async (req, res) => {
      const user = await userService.updateUserStatus(
        { userId: req.principal!.userId, role: req.principal!.role },
        String(req.params.id),
        req.body,
      );
      return okResponse(res, { user });
    }),
  );

  // Admin Doctors & Hospitals
  router.get(
    '/doctors',
    authenticate,
    authorizePermissions([PERMISSIONS.DOCTORS_READ], db),
    asyncHandler(async (req, res) => {
      const q = String(req.query.q ?? '').trim();
      const status = String(req.query.status ?? '').trim();
      const page = Math.max(1, Number(req.query.page ?? '1') || 1);
      const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize ?? '15') || 15));

      const where = {
        archivedAt: null,
        ...(status && (VERIFICATION_STATUSES as readonly string[]).includes(status)
          ? { verificationStatus: status }
          : {}),
        ...(q
          ? {
              OR: [
                { medicalLicenseNumber: { contains: q } },
                { city: { contains: q } },
                { user: { fullName: { contains: q } } },
                { user: { email: { contains: q.toLowerCase() } } },
              ],
            }
          : {}),
      };

      const [total, doctors] = await Promise.all([
        db.doctor.count({ where }),
        db.doctor.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            user: { select: { id: true, fullName: true, email: true, phone: true, accountStatus: true } },
            specializations: { select: { id: true, specializationCode: true, specializationName: true, isPrimary: true } },
            _count: { select: { leadAssignments: true } },
          },
        }),
      ]);

      return okResponse(res, { doctors, pagination: { page, pageSize, total } });
    }),
  );

  router.get(
    '/doctors/:id',
    authenticate,
    authorizePermissions([PERMISSIONS.DOCTORS_READ], db),
    validateRequest({ params: idParam }),
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const [doctor, assignmentCounts] = await Promise.all([
        db.doctor.findUnique({
          where: { id },
          include: {
            user: { select: { id: true, fullName: true, email: true, phone: true, accountStatus: true } },
            primaryHospital: { select: { id: true, displayName: true } },
            specializations: true,
            documents: { orderBy: { createdAt: 'desc' } },
          },
        }),
        db.leadAssignment.groupBy({ by: ['status'], where: { doctorId: id }, _count: { _all: true } }),
      ]);
      if (!doctor) throw new NotFoundError('DOCTOR_NOT_FOUND', 'Doctor not found.');
      return okResponse(res, { doctor, assignmentCounts });
    }),
  );

  router.post(
    '/doctors/:id/specializations',
    csrfProtection,
    authenticate,
    authorizePermissions([PERMISSIONS.DOCTORS_UPDATE], db),
    validateRequest({
      params: idParam,
      body: z.object({
        specializationCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,64}$/),
        specializationName: z.string().trim().min(2).max(120),
        isPrimary: z.boolean().default(false),
        boardCertified: z.boolean().default(false),
      }),
    }),
    asyncHandler(async (req, res) => {
      const doctorId = String(req.params.id);
      const body = req.body as {
        specializationCode: string;
        specializationName: string;
        isPrimary: boolean;
        boardCertified: boolean;
      };
      const specialization = await db.$transaction(async (tx) => {
        if (body.isPrimary) {
          await tx.doctorSpecialization.updateMany({ where: { doctorId }, data: { isPrimary: false } });
        }
        const created = await tx.doctorSpecialization.upsert({
          where: { doctorId_specializationCode: { doctorId, specializationCode: body.specializationCode } },
          create: { doctorId, ...body },
          update: { specializationName: body.specializationName, isPrimary: body.isPrimary, boardCertified: body.boardCertified },
        });
        await recordAuditLog(
          {
            actorUserId: req.principal!.userId,
            actorRole: req.principal!.role,
            action: 'DOCTOR_SPECIALIZATION_UPSERTED',
            resourceType: 'Doctor',
            resourceId: doctorId,
          },
          tx,
        );
        return created;
      });
      return okResponse(res, { specialization }, 201);
    }),
  );

  router.delete(
    '/doctors/:id/specializations',
    csrfProtection,
    authenticate,
    authorizePermissions([PERMISSIONS.DOCTORS_UPDATE], db),
    validateRequest({ params: idParam }),
    asyncHandler(async (req, res) => {
      const doctorId = String(req.params.id);
      const specId = String(req.query.specId ?? '');
      if (!specId) throw new NotFoundError('SPEC_ID_REQUIRED', 'Missing specId query parameter.');
      await db.doctorSpecialization.deleteMany({ where: { id: specId, doctorId } });
      await recordAuditLog(
        {
          actorUserId: req.principal!.userId,
          actorRole: req.principal!.role,
          action: 'DOCTOR_SPECIALIZATION_REMOVED',
          resourceType: 'Doctor',
          resourceId: doctorId,
          metadata: { specId },
        },
        db,
      );
      return okResponse(res, { deleted: true });
    }),
  );

  router.get(
    '/hospitals',
    authenticate,
    authorizePermissions([PERMISSIONS.HOSPITALS_READ], db),
    asyncHandler(async (req, res) => {
      const q = String(req.query.q ?? '').trim();
      const status = String(req.query.status ?? '').trim();
      const page = Math.max(1, Number(req.query.page ?? '1') || 1);
      const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize ?? '15') || 15));

      const where = {
        archivedAt: null,
        ...(status && (VERIFICATION_STATUSES as readonly string[]).includes(status)
          ? { verificationStatus: status }
          : {}),
        ...(q
          ? {
              OR: [
                { displayName: { contains: q } },
                { legalName: { contains: q } },
                { registrationNumber: { contains: q } },
                { city: { contains: q } },
                { contactEmail: { contains: q.toLowerCase() } },
              ],
            }
          : {}),
      };

      const [total, hospitals] = await Promise.all([
        db.hospital.count({ where }),
        db.hospital.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            user: { select: { id: true, email: true, accountStatus: true } },
            departments: { select: { id: true, name: true, specializationCode: true, isActive: true } },
            _count: { select: { leadAssignments: true } },
          },
        }),
      ]);
      return okResponse(res, { hospitals, pagination: { page, pageSize, total } });
    }),
  );

  router.get(
    '/hospitals/:id',
    authenticate,
    authorizePermissions([PERMISSIONS.HOSPITALS_READ], db),
    validateRequest({ params: idParam }),
    asyncHandler(async (req, res) => {
      const id = String(req.params.id);
      const [hospital, assignmentCounts] = await Promise.all([
        db.hospital.findUnique({
          where: { id },
          include: {
            user: { select: { id: true, email: true, accountStatus: true } },
            departments: { orderBy: { createdAt: 'desc' } },
            affiliatedDoctors: { include: { user: { select: { fullName: true } } } },
            documents: { orderBy: { createdAt: 'desc' } },
          },
        }),
        db.leadAssignment.groupBy({ by: ['status'], where: { hospitalId: id }, _count: { _all: true } }),
      ]);
      if (!hospital) throw new NotFoundError('HOSPITAL_NOT_FOUND', 'Hospital not found.');
      return okResponse(res, { hospital, assignmentCounts });
    }),
  );

  router.post(
    '/hospitals/:id/departments',
    csrfProtection,
    authenticate,
    authorizePermissions([PERMISSIONS.HOSPITALS_UPDATE], db),
    validateRequest({
      params: idParam,
      body: z.object({
        name: z.string().trim().min(2).max(120),
        specializationCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,64}$/),
        specializationName: z.string().trim().min(2).max(120),
        headDoctorName: z.string().trim().max(120).optional(),
      }),
    }),
    asyncHandler(async (req, res) => {
      const hospitalId = String(req.params.id);
      const body = req.body as { name: string; specializationCode: string; specializationName: string; headDoctorName?: string };
      const department = await db.hospitalDepartment.upsert({
        where: { hospitalId_specializationCode: { hospitalId, specializationCode: body.specializationCode } },
        create: { hospitalId, ...body, headDoctorName: body.headDoctorName ?? null },
        update: { name: body.name, specializationName: body.specializationName, headDoctorName: body.headDoctorName ?? null },
      });
      await recordAuditLog(
        {
          actorUserId: req.principal!.userId,
          actorRole: req.principal!.role,
          action: 'HOSPITAL_DEPARTMENT_UPSERTED',
          resourceType: 'Hospital',
          resourceId: hospitalId,
        },
        db,
      );
      return okResponse(res, { department }, 201);
    }),
  );

  router.patch(
    '/hospitals/:id/departments',
    csrfProtection,
    authenticate,
    authorizePermissions([PERMISSIONS.HOSPITALS_UPDATE], db),
    validateRequest({
      params: idParam,
      body: z.object({ departmentId: uuidSchema, isActive: z.boolean(), isAcceptingLeads: z.boolean() }),
    }),
    asyncHandler(async (req, res) => {
      const hospitalId = String(req.params.id);
      const body = req.body as { departmentId: string; isActive: boolean; isAcceptingLeads: boolean };
      const updated = await db.hospitalDepartment.updateMany({
        where: { id: body.departmentId, hospitalId },
        data: { isActive: body.isActive, isAcceptingLeads: body.isAcceptingLeads },
      });
      await recordAuditLog(
        {
          actorUserId: req.principal!.userId,
          actorRole: req.principal!.role,
          action: 'HOSPITAL_DEPARTMENT_UPDATED',
          resourceType: 'HospitalDepartment',
          resourceId: body.departmentId,
        },
        db,
      );
      return okResponse(res, { updated: updated.count });
    }),
  );

  // Provider Verification & Documents
  router.post(
    '/providers/verify',
    csrfProtection,
    authenticate,
    validateRequest({
      body: z.object({
        providerType: z.enum(['DOCTOR', 'HOSPITAL']),
        providerId: uuidSchema,
        decision: z.enum(['VERIFIED', 'REJECTED']),
        rejectionReason: z.string().trim().min(3).max(500).optional(),
      }),
    }),
    asyncHandler(async (req, res) => {
      const body = req.body as {
        providerType: 'DOCTOR' | 'HOSPITAL';
        providerId: string;
        decision: 'VERIFIED' | 'REJECTED';
        rejectionReason?: string;
      };
      const required = body.providerType === 'DOCTOR' ? PERMISSIONS.DOCTORS_VERIFY : PERMISSIONS.HOSPITALS_VERIFY;
      if (!req.principal!.permissions.includes(required)) {
        throw new ForbiddenError('FORBIDDEN_PERMISSION', `Missing permission '${required}'.`);
      }

      const now = new Date();
      const provider = await db.$transaction(async (tx) => {
        if (body.providerType === 'DOCTOR') {
          const doc = await tx.doctor.findUnique({
            where: { id: body.providerId },
            select: { id: true, userId: true, user: { select: { emailVerified: true } } },
          });
          if (!doc) throw new NotFoundError('DOCTOR_NOT_FOUND', 'Doctor not found.');
          const updated = await tx.doctor.update({
            where: { id: doc.id },
            data: {
              verificationStatus: body.decision,
              verifiedAt: body.decision === 'VERIFIED' ? now : null,
              verifiedByUserId: req.principal!.userId,
              rejectionReason: body.decision === 'REJECTED' ? (body.rejectionReason ?? 'Rejected') : null,
            },
          });
          const nextStatus: AccountStatus =
            body.decision === 'VERIFIED' ? (doc.user.emailVerified ? 'ACTIVE' : 'PENDING_VERIFICATION') : 'REJECTED';
          await tx.user.update({ where: { id: doc.userId }, data: { accountStatus: nextStatus } });
          await recordAuditLog(
            {
              actorUserId: req.principal!.userId,
              actorRole: req.principal!.role,
              action: `DOCTOR_VERIFICATION_${body.decision}`,
              resourceType: 'Doctor',
              resourceId: doc.id,
            },
            tx,
          );
          return updated;
        }

        const hosp = await tx.hospital.findUnique({
          where: { id: body.providerId },
          select: { id: true, userId: true, user: { select: { emailVerified: true } } },
        });
        if (!hosp) throw new NotFoundError('HOSPITAL_NOT_FOUND', 'Hospital not found.');
        const updated = await tx.hospital.update({
          where: { id: hosp.id },
          data: {
            verificationStatus: body.decision,
            verifiedAt: body.decision === 'VERIFIED' ? now : null,
            verifiedByUserId: req.principal!.userId,
            rejectionReason: body.decision === 'REJECTED' ? (body.rejectionReason ?? 'Rejected') : null,
          },
        });
        const nextStatus: AccountStatus =
          body.decision === 'VERIFIED' ? (hosp.user.emailVerified ? 'ACTIVE' : 'PENDING_VERIFICATION') : 'REJECTED';
        await tx.user.update({ where: { id: hosp.userId }, data: { accountStatus: nextStatus } });
        await recordAuditLog(
          {
            actorUserId: req.principal!.userId,
            actorRole: req.principal!.role,
            action: `HOSPITAL_VERIFICATION_${body.decision}`,
            resourceType: 'Hospital',
            resourceId: hosp.id,
          },
          tx,
        );
        return updated;
      });
      return okResponse(res, { provider });
    }),
  );

  router.post(
    '/providers/documents/:id/review',
    csrfProtection,
    authenticate,
    validateRequest({
      params: idParam,
      body: z.object({
        providerType: z.enum(['DOCTOR', 'HOSPITAL']),
        decision: z.enum(['APPROVED', 'REJECTED']),
        notes: z.string().trim().max(500).optional(),
      }),
    }),
    asyncHandler(async (req, res) => {
      const body = req.body as { providerType: 'DOCTOR' | 'HOSPITAL'; decision: 'APPROVED' | 'REJECTED'; notes?: string };
      const required = body.providerType === 'DOCTOR' ? PERMISSIONS.DOCTORS_VERIFY : PERMISSIONS.HOSPITALS_VERIFY;
      if (!req.principal!.permissions.includes(required)) {
        throw new ForbiddenError('FORBIDDEN_PERMISSION', `Missing permission '${required}'.`);
      }

      const document = await db.providerDocument.update({
        where: { id: String(req.params.id) },
        data: {
          reviewStatus: body.decision,
          reviewedByUserId: req.principal!.userId,
          reviewedAt: new Date(),
          notes: body.notes ?? null,
        },
      });
      await recordAuditLog(
        {
          actorUserId: req.principal!.userId,
          actorRole: req.principal!.role,
          action: `PROVIDER_DOCUMENT_${body.decision}`,
          resourceType: 'ProviderDocument',
          resourceId: document.id,
        },
        db,
      );
      return okResponse(res, { document });
    }),
  );

  // Admin Leads CRM & Matching
  router.get(
    '/leads',
    authenticate,
    authorizePermissions([PERMISSIONS.LEADS_READ], db),
    asyncHandler(async (req, res) => {
      const q = String(req.query.q ?? '').trim();
      const status = String(req.query.status ?? '').trim();
      const priority = String(req.query.priority ?? '').trim();
      const source = String(req.query.source ?? '').trim();
      const specialization = String(req.query.specialization ?? '').trim();
      const page = Math.max(1, Number(req.query.page ?? '1') || 1);
      const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize ?? '15') || 15));

      const where = {
        archivedAt: null,
        ...(status && (LEAD_STATUSES as readonly string[]).includes(status) ? { status } : {}),
        ...(priority && (LEAD_PRIORITIES as readonly string[]).includes(priority) ? { priority } : {}),
        ...(source && (LEAD_SOURCES as readonly string[]).includes(source) ? { leadSource: source } : {}),
        ...(specialization ? { specialization: { contains: specialization.toUpperCase() } } : {}),
        ...(q
          ? {
              OR: [
                { id: { contains: q } },
                { specialization: { contains: q.toUpperCase() } },
                { locationCity: { contains: q } },
                { locationState: { contains: q } },
                { enquiryDescription: { contains: q } },
              ],
            }
          : {}),
      };

      const [total, rawLeads] = await Promise.all([
        db.lead.count({ where }),
        db.lead.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            patientId: true,
            specialization: true,
            locationCity: true,
            locationState: true,
            countryCode: true,
            enquiryDescription: true,
            leadSource: true,
            status: true,
            priority: true,
            createdAt: true,
            assignments: {
              where: { status: { in: ['PENDING', 'ACCEPTED'] } },
              take: 1,
              select: {
                providerType: true,
                doctor: { select: { user: { select: { fullName: true } } } },
                hospital: { select: { displayName: true } },
              },
            },
          },
        }),
      ]);

      const leads = rawLeads.map((l) => {
        const activeAssign = l.assignments[0];
        const assignedProvider = activeAssign
          ? activeAssign.providerType === 'DOCTOR'
            ? activeAssign.doctor?.user.fullName ?? 'Doctor'
            : activeAssign.hospital?.displayName ?? 'Hospital'
          : null;
        return {
          id: l.id,
          patientRef: `PAT-${l.patientId.slice(0, 8).toUpperCase()}`,
          specialization: l.specialization,
          location: `${l.locationCity}, ${l.locationState} (${l.countryCode})`,
          enquiryDescription: l.enquiryDescription,
          leadSource: l.leadSource,
          status: l.status,
          priority: l.priority,
          assignedProvider,
          createdAt: l.createdAt,
        };
      });

      return okResponse(res, { leads, pagination: { page, pageSize, total } });
    }),
  );

  router.get(
    '/leads/:id',
    authenticate,
    authorizePermissions([PERMISSIONS.LEADS_READ], db),
    validateRequest({ params: idParam }),
    asyncHandler(async (req, res) => {
      const lead = await db.lead.findUnique({
        where: { id: String(req.params.id) },
        include: {
          consents: { orderBy: { grantedAt: 'desc' } },
          assignments: {
            orderBy: { assignedAt: 'desc' },
            include: {
              doctor: { include: { user: { select: { fullName: true } } } },
              hospital: { select: { displayName: true } },
            },
          },
          history: { orderBy: { createdAt: 'desc' } },
        },
      });
      if (!lead) throw new NotFoundError('LEAD_NOT_FOUND', 'Lead not found.');
      return okResponse(res, { lead });
    }),
  );

  router.get(
    '/leads/:id/matches',
    authenticate,
    authorizePermissions([PERMISSIONS.LEADS_READ], db),
    validateRequest({ params: idParam }),
    asyncHandler(async (req, res) => {
      const matches = await findEligibleProvidersForLead(
        String(req.params.id),
        {
          q: req.query.q ? String(req.query.q) : undefined,
          specialization: req.query.specialization ? String(req.query.specialization) : undefined,
          city: req.query.city ? String(req.query.city) : undefined,
        },
        db,
      );
      return okResponse(res, { matches });
    }),
  );

  router.post(
    '/leads/:id/matches',
    csrfProtection,
    authenticate,
    authorizePermissions([PERMISSIONS.LEADS_ASSIGN], db),
    validateRequest({ params: idParam }),
    asyncHandler(async (req, res) => {
      const leadId = String(req.params.id);
      const candidates = await findEligibleProvidersForLead(leadId, {}, db);
      const eligible = candidates.find(
        (c) => c.specializationMatched && c.hasActiveSubscription && !c.alreadyAssigned,
      );
      if (!eligible) {
        throw new ConflictError(
          'NO_ELIGIBLE_MATCH',
          'No verified provider with matching specialization, active subscription quota, and availability was found.',
        );
      }
      const assignment = await assignmentService.assignLeadToProvider({
        actorUserId: req.principal!.userId,
        actorRole: req.principal!.role,
        leadId,
        providerType: eligible.providerType,
        providerId: eligible.providerId,
        matchScore: eligible.matchScore,
      });
      return okResponse(res, { assignment }, 201);
    }),
  );

  router.post(
    '/leads/:id/reassign',
    csrfProtection,
    authenticate,
    authorizePermissions([PERMISSIONS.LEADS_ASSIGN], db),
    validateRequest({
      params: idParam,
      body: z.object({
        revokeAssignmentId: uuidSchema.optional(),
        providerType: z.enum(['DOCTOR', 'HOSPITAL']),
        providerId: uuidSchema,
        reason: z.string().trim().min(3).max(500).default('Reassigned by administrator'),
      }),
    }),
    asyncHandler(async (req, res) => {
      const leadId = String(req.params.id);
      const body = req.body as {
        revokeAssignmentId?: string;
        providerType: 'DOCTOR' | 'HOSPITAL';
        providerId: string;
        reason: string;
      };
      if (body.revokeAssignmentId) {
        await db.$transaction(async (tx) => {
          await tx.leadAssignment.updateMany({
            where: { id: body.revokeAssignmentId, leadId, status: { in: ['PENDING', 'ACCEPTED'] } },
            data: { status: 'REVOKED', rejectedAt: new Date(), rejectionReason: body.reason },
          });
          await tx.leadHistory.create({
            data: {
              leadId,
              assignmentId: body.revokeAssignmentId,
              actorUserId: req.principal!.userId,
              eventType: 'ASSIGNMENT_REVOKED_FOR_REASSIGN',
              reason: body.reason,
            },
          });
        });
      }
      const assignment = await assignmentService.assignLeadToProvider({
        actorUserId: req.principal!.userId,
        actorRole: req.principal!.role,
        leadId,
        providerType: body.providerType,
        providerId: body.providerId,
      });
      return okResponse(res, { assignment }, 201);
    }),
  );

  router.post(
    '/leads/:id/reveal-contact',
    csrfProtection,
    authenticate,
    authorizePermissions([PERMISSIONS.PATIENTS_READ], db),
    validateRequest({ params: idParam }),
    asyncHandler(async (req, res) => {
      const leadId = String(req.params.id);
      const lead = await db.lead.findUnique({
        where: { id: leadId },
        include: {
          patient: { include: { user: { select: { fullName: true, email: true, phone: true } } } },
          consents: {
            where: { consentPurpose: 'PROVIDER_CONTACT_DISCLOSURE', status: 'GRANTED', revokedAt: null },
            take: 1,
          },
        },
      });
      if (!lead) throw new NotFoundError('LEAD_NOT_FOUND', 'Lead not found.');
      if (lead.consents.length === 0) {
        await recordAuditLog(
          {
            actorUserId: req.principal!.userId,
            actorRole: req.principal!.role,
            action: 'ADMIN_PATIENT_CONTACT_REVEAL_DENIED_NO_CONSENT',
            resourceType: 'Lead',
            resourceId: leadId,
            outcome: 'DENIED',
          },
          db,
        );
        throw new ConsentRequiredError('Active consent is required before revealing patient contact details.');
      }
      await recordAuditLog(
        {
          actorUserId: req.principal!.userId,
          actorRole: req.principal!.role,
          action: 'ADMIN_VIEWED_CONSENTED_PATIENT_CONTACT',
          resourceType: 'Lead',
          resourceId: leadId,
        },
        db,
      );
      return okResponse(res, {
        contact: {
          fullName: lead.patient.user.fullName,
          email: lead.patient.user.email,
          phone: lead.patient.user.phone,
        },
      });
    }),
  );

  // Mount sub-routers under /api/v1/admin/*
  router.use('/subscriptions', createSubscriptionAdminRoutes(db));
  router.use('/payments', createPaymentAdminRoutes(db));
  router.use('/notifications', createNotificationAdminRoutes(db));
  router.use('/audit-logs', createAuditLogAdminRoutes(db));
  router.use('/', createAdminSupportAndSettingsRoutes(db));

  return router;
}
