import type { PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database';
import { PERMISSIONS } from '../../security/permissions';
import {
  type ConsultationMode,
  isAdminRole,
  type LeadPriority,
  type LeadSource,
  type LeadStatus,
} from '../../shared/constants';
import { ConflictError, ForbiddenError, NotFoundError } from '../../shared/errors';
import { buildPaginationMeta } from '../../shared/utils';
import { recordAuditLog } from '../audit-logs/audit-log.service';
import { ConsentService } from '../consent/consent.service';

export class LeadService {
  private readonly consentService: ConsentService;

  constructor(private readonly db: PrismaClient = prisma) {
    this.consentService = new ConsentService(db);
  }

  async createPatientLead(params: {
    actorUserId: string;
    specialization: string;
    locationCity: string;
    locationState: string;
    countryCode: string;
    consultationMode: ConsultationMode;
    enquiryDescription: string;
    leadSource?: LeadSource;
    priority?: LeadPriority;
    idempotencyKey: string;
    grantDisclosureConsent?: boolean;
    consentVersion?: string;
    ipHash?: string | null;
    userAgentHash?: string | null;
  }) {
    const patient = await this.db.patient.findUnique({
      where: { userId: params.actorUserId },
      select: { id: true, archivedAt: true },
    });
    if (!patient || patient.archivedAt !== null) {
      throw new NotFoundError('PATIENT_NOT_FOUND', 'Patient profile not found.');
    }

    const existing = await this.db.lead.findUnique({
      where: {
        patientId_idempotencyKey: {
          patientId: patient.id,
          idempotencyKey: params.idempotencyKey,
        },
      },
    });
    if (existing) {
      return existing;
    }

    return this.db.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          patientId: patient.id,
          specialization: params.specialization.toUpperCase(),
          locationCity: params.locationCity,
          locationState: params.locationState,
          countryCode: params.countryCode.toUpperCase(),
          consultationMode: params.consultationMode,
          enquiryDescription: params.enquiryDescription,
          leadSource: params.leadSource ?? 'WEB_PORTAL',
          priority: params.priority ?? 'MEDIUM',
          status: 'NEW',
          idempotencyKey: params.idempotencyKey,
        },
      });

      await tx.leadHistory.create({
        data: {
          leadId: lead.id,
          actorUserId: params.actorUserId,
          eventType: 'CREATED',
          toStatus: 'NEW',
        },
      });

      if (params.grantDisclosureConsent) {
        await tx.patientConsent.create({
          data: {
            patientId: patient.id,
            leadId: lead.id,
            consentPurpose: 'PROVIDER_CONTACT_DISCLOSURE',
            authorizedProviderScope: 'MATCHED_PROVIDERS',
            status: 'GRANTED',
            consentVersion: params.consentVersion ?? 'v1.0',
            ipHash: params.ipHash ?? null,
            userAgentHash: params.userAgentHash ?? null,
          },
        });
      }

      await recordAuditLog(
        {
          actorUserId: params.actorUserId,
          actorRole: 'PATIENT',
          action: 'LEAD_CREATED',
          resourceType: 'Lead',
          resourceId: lead.id,
          metadata: { specialization: lead.specialization, consentGranted: Boolean(params.grantDisclosureConsent) },
        },
        tx,
      );

      return lead;
    });
  }

  async listLeadsForPrincipal(
    principal: { userId: string; role: string; permissions: readonly string[] },
    pagination: { page: number; pageSize: number; status?: string },
  ) {
    const skip = (pagination.page - 1) * pagination.pageSize;

    if (principal.role === 'PATIENT') {
      const patient = await this.db.patient.findUnique({ where: { userId: principal.userId } });
      if (!patient) return { leads: [], pagination: buildPaginationMeta(1, pagination.pageSize, 0) };

      const where = {
        patientId: patient.id,
        archivedAt: null,
        ...(pagination.status ? { status: pagination.status } : {}),
      };
      const [total, leads] = await Promise.all([
        this.db.lead.count({ where }),
        this.db.lead.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: pagination.pageSize,
          include: {
            assignments: {
              select: {
                id: true,
                providerType: true,
                status: true,
                assignedAt: true,
                doctor: { select: { id: true, user: { select: { fullName: true } } } },
                hospital: { select: { id: true, displayName: true } },
              },
            },
            consents: {
              select: { id: true, consentPurpose: true, status: true, consentVersion: true, grantedAt: true, revokedAt: true },
            },
          },
        }),
      ]);
      return { leads, pagination: buildPaginationMeta(pagination.page, pagination.pageSize, total) };
    }

    if (principal.role === 'DOCTOR') {
      const doctor = await this.db.doctor.findUnique({ where: { userId: principal.userId } });
      if (!doctor) return { leads: [], pagination: buildPaginationMeta(1, pagination.pageSize, 0) };

      const where = {
        archivedAt: null,
        assignments: {
          some: {
            providerType: 'DOCTOR',
            doctorId: doctor.id,
            status: { in: ['PENDING', 'ACCEPTED'] },
          },
        },
      };
      const [total, leads] = await Promise.all([
        this.db.lead.count({ where }),
        this.db.lead.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: pagination.pageSize,
          select: {
            id: true,
            specialization: true,
            locationCity: true,
            locationState: true,
            countryCode: true,
            consultationMode: true,
            status: true,
            priority: true,
            createdAt: true,
            assignments: {
              where: { doctorId: doctor.id },
              select: { id: true, status: true, matchScore: true, assignedAt: true, acceptedAt: true },
            },
          },
        }),
      ]);
      return { leads, pagination: buildPaginationMeta(pagination.page, pagination.pageSize, total) };
    }

    if (principal.role === 'HOSPITAL') {
      const hospital = await this.db.hospital.findUnique({ where: { userId: principal.userId } });
      if (!hospital) return { leads: [], pagination: buildPaginationMeta(1, pagination.pageSize, 0) };

      const where = {
        archivedAt: null,
        assignments: {
          some: {
            providerType: 'HOSPITAL',
            hospitalId: hospital.id,
            status: { in: ['PENDING', 'ACCEPTED'] },
          },
        },
      };
      const [total, leads] = await Promise.all([
        this.db.lead.count({ where }),
        this.db.lead.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: pagination.pageSize,
          select: {
            id: true,
            specialization: true,
            locationCity: true,
            locationState: true,
            countryCode: true,
            consultationMode: true,
            status: true,
            priority: true,
            createdAt: true,
            assignments: {
              where: { hospitalId: hospital.id },
              select: { id: true, status: true, matchScore: true, assignedAt: true, acceptedAt: true },
            },
          },
        }),
      ]);
      return { leads, pagination: buildPaginationMeta(pagination.page, pagination.pageSize, total) };
    }

    if (!isAdminRole(principal.role) || !principal.permissions.includes(PERMISSIONS.LEADS_READ)) {
      throw new ForbiddenError('FORBIDDEN_PERMISSION', 'Missing leads.read permission.');
    }

    const where = {
      archivedAt: null,
      ...(pagination.status ? { status: pagination.status } : {}),
    };
    const [total, leads] = await Promise.all([
      this.db.lead.count({ where }),
      this.db.lead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pagination.pageSize,
        include: {
          assignments: {
            select: {
              id: true,
              providerType: true,
              status: true,
              doctorId: true,
              hospitalId: true,
              assignedAt: true,
            },
          },
        },
      }),
    ]);

    return { leads, pagination: buildPaginationMeta(pagination.page, pagination.pageSize, total) };
  }

  async getLeadDetail(
    leadId: string,
    principal: { userId: string; role: string; permissions: readonly string[] },
  ) {
    const lead = await this.db.lead.findUnique({
      where: { id: leadId },
      include: {
        assignments: {
          include: {
            doctor: { select: { id: true, user: { select: { fullName: true } } } },
            hospital: { select: { id: true, displayName: true } },
          },
        },
        history: { orderBy: { createdAt: 'asc' } },
        consents: {
          select: { id: true, consentPurpose: true, authorizedProviderScope: true, status: true, consentVersion: true, grantedAt: true, revokedAt: true },
        },
      },
    });
    if (!lead || lead.archivedAt !== null) {
      throw new NotFoundError('LEAD_NOT_FOUND', 'Lead not found.');
    }

    if (principal.role === 'PATIENT') {
      const patient = await this.db.patient.findUnique({ where: { userId: principal.userId } });
      if (!patient || lead.patientId !== patient.id) {
        throw new ForbiddenError('FORBIDDEN_OWNERSHIP', 'Patients can only inspect their own leads.');
      }
      return { lead, patientContact: null };
    }

    if (principal.role === 'DOCTOR' || principal.role === 'HOSPITAL') {
      const providerId =
        principal.role === 'DOCTOR'
          ? (await this.db.doctor.findUnique({ where: { userId: principal.userId } }))?.id
          : (await this.db.hospital.findUnique({ where: { userId: principal.userId } }))?.id;

      const assignment = lead.assignments.find(
        (a) =>
          (a.status === 'PENDING' || a.status === 'ACCEPTED') &&
          ((principal.role === 'DOCTOR' && a.doctorId === providerId) ||
            (principal.role === 'HOSPITAL' && a.hospitalId === providerId)),
      );

      if (!providerId || !assignment) {
        throw new ForbiddenError(
          'FORBIDDEN_OWNERSHIP',
          'Providers cannot view leads not assigned to them.',
        );
      }

      let patientContact = null;
      if (assignment.status === 'ACCEPTED') {
        try {
          patientContact = await this.consentService.getConsentedPatientContactForProvider({
            actorUserId: principal.userId,
            actorRole: principal.role as 'DOCTOR' | 'HOSPITAL',
            providerType: principal.role as 'DOCTOR' | 'HOSPITAL',
            providerId,
            leadId: lead.id,
          });
        } catch {
          patientContact = null;
        }
      }

      return { lead, patientContact };
    }

    if (!isAdminRole(principal.role) || !principal.permissions.includes(PERMISSIONS.LEADS_READ)) {
      throw new ForbiddenError('FORBIDDEN_PERMISSION', 'Missing leads.read permission.');
    }

    return { lead, patientContact: null };
  }

  async updateLeadStatus(params: {
    leadId: string;
    actor: { userId: string; role: string; permissions: readonly string[] };
    nextStatus: LeadStatus;
    reason?: string;
  }) {
    const lead = await this.db.lead.findUnique({ where: { id: params.leadId } });
    if (!lead || lead.archivedAt !== null) {
      throw new NotFoundError('LEAD_NOT_FOUND', 'Lead not found.');
    }

    if (params.actor.role === 'DOCTOR' || params.actor.role === 'HOSPITAL') {
      const allowedProviderStatuses: LeadStatus[] = ['CONTACTED', 'CONVERTED', 'CLOSED'];
      if (!allowedProviderStatuses.includes(params.nextStatus)) {
        throw new ForbiddenError(
          'FORBIDDEN_STATUS_TRANSITION',
          'Providers can only update accepted leads to CONTACTED, CONVERTED, or CLOSED.',
        );
      }
      const providerId =
        params.actor.role === 'DOCTOR'
          ? (await this.db.doctor.findUnique({ where: { userId: params.actor.userId } }))?.id
          : (await this.db.hospital.findUnique({ where: { userId: params.actor.userId } }))?.id;
      const accepted = providerId
        ? await this.db.leadAssignment.findFirst({
            where: {
              leadId: lead.id,
              status: 'ACCEPTED',
              ...(params.actor.role === 'DOCTOR' ? { doctorId: providerId } : { hospitalId: providerId }),
            },
          })
        : null;
      if (!accepted) {
        throw new ForbiddenError(
          'FORBIDDEN_OWNERSHIP',
          'You must hold an accepted assignment on this lead to update its status.',
        );
      }
    } else if (
      !isAdminRole(params.actor.role) ||
      (!params.actor.permissions.includes(PERMISSIONS.LEADS_QUALIFY) &&
        !params.actor.permissions.includes(PERMISSIONS.LEADS_UPDATE) &&
        !params.actor.permissions.includes(PERMISSIONS.LEADS_REJECT))
    ) {
      throw new ForbiddenError('FORBIDDEN_PERMISSION', 'Insufficient permission to modify lead status.');
    }

    if (lead.status === 'CLOSED' && params.nextStatus !== 'CLOSED') {
      throw new ConflictError('LEAD_ALREADY_CLOSED', 'Closed leads cannot be reopened.');
    }

    const now = new Date();
    return this.db.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id: lead.id },
        data: {
          status: params.nextStatus,
          ...(params.nextStatus === 'QUALIFIED' ? { qualifiedAt: now, qualifiedByUserId: params.actor.userId } : {}),
          ...(params.nextStatus === 'CLOSED' || params.nextStatus === 'REJECTED'
            ? { closedAt: now, closureReason: params.reason ?? null }
            : {}),
        },
      });

      await tx.leadHistory.create({
        data: {
          leadId: lead.id,
          actorUserId: params.actor.userId,
          eventType: 'STATUS_CHANGED',
          fromStatus: lead.status,
          toStatus: params.nextStatus,
          reason: params.reason ?? null,
        },
      });

      await recordAuditLog(
        {
          actorUserId: params.actor.userId,
          actorRole: params.actor.role,
          action: 'LEAD_STATUS_UPDATED',
          resourceType: 'Lead',
          resourceId: lead.id,
          metadata: { fromStatus: lead.status, toStatus: params.nextStatus },
        },
        tx,
      );

      return updated;
    });
  }
}
