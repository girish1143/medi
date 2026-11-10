import type { PrismaClient } from '@prisma/client';
import { prisma } from '../db/prisma';
import type { ProviderType } from '../domain/enums';
import { recordAuditLog } from './audit.service';

export class LeadAssignmentError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'LeadAssignmentError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Transactionally assigns a qualified lead to a verified Doctor or Hospital,
 * enforcing active consent and preventing duplicate active assignments.
 */
export async function assignLeadToProvider(
  params: {
    actorUserId: string;
    actorRole: string;
    leadId: string;
    providerType: ProviderType;
    providerId: string;
    matchScore?: number;
    expiresAt?: Date;
  },
  db: PrismaClient = prisma,
) {
  return db.$transaction(async (tx) => {
    const lead = await tx.lead.findUnique({
      where: { id: params.leadId },
      select: { id: true, status: true, archivedAt: true },
    });

    if (!lead || lead.archivedAt !== null) {
      throw new LeadAssignmentError(404, 'LEAD_NOT_FOUND', 'Lead does not exist.');
    }

    if (lead.status !== 'QUALIFIED' && lead.status !== 'ASSIGNED') {
      throw new LeadAssignmentError(
        409,
        'INVALID_LEAD_STATUS',
        `Lead in status '${lead.status}' cannot be assigned.`,
      );
    }

    const now = new Date();
    const activeConsent = await tx.patientConsent.findFirst({
      where: {
        leadId: params.leadId,
        consentPurpose: 'PROVIDER_CONTACT_DISCLOSURE',
        status: 'GRANTED',
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { id: true },
    });

    if (!activeConsent) {
      throw new LeadAssignmentError(
        403,
        'CONSENT_REQUIRED',
        'Active patient disclosure consent is required before assigning a lead.',
      );
    }

    if (params.providerType === 'DOCTOR') {
      const doctor = await tx.doctor.findUnique({
        where: { id: params.providerId },
        select: { verificationStatus: true, isAcceptingLeads: true, archivedAt: true },
      });
      if (
        !doctor ||
        doctor.archivedAt !== null ||
        doctor.verificationStatus !== 'VERIFIED' ||
        !doctor.isAcceptingLeads
      ) {
        throw new LeadAssignmentError(
          422,
          'PROVIDER_INELIGIBLE',
          'Doctor is not verified or not accepting leads.',
        );
      }
    } else {
      const hospital = await tx.hospital.findUnique({
        where: { id: params.providerId },
        select: { verificationStatus: true, isAcceptingLeads: true, archivedAt: true },
      });
      if (
        !hospital ||
        hospital.archivedAt !== null ||
        hospital.verificationStatus !== 'VERIFIED' ||
        !hospital.isAcceptingLeads
      ) {
        throw new LeadAssignmentError(
          422,
          'PROVIDER_INELIGIBLE',
          'Hospital is not verified or not accepting leads.',
        );
      }
    }

    const existingDuplicate = await tx.leadAssignment.findFirst({
      where: {
        leadId: params.leadId,
        providerType: params.providerType,
        status: { in: ['PENDING', 'ACCEPTED'] },
        ...(params.providerType === 'DOCTOR'
          ? { doctorId: params.providerId }
          : { hospitalId: params.providerId }),
      },
      select: { id: true },
    });

    if (existingDuplicate) {
      throw new LeadAssignmentError(
        409,
        'DUPLICATE_ASSIGNMENT',
        'An active assignment already exists for this provider and lead.',
      );
    }

    const assignment = await tx.leadAssignment.create({
      data: {
        leadId: params.leadId,
        providerType: params.providerType,
        doctorId: params.providerType === 'DOCTOR' ? params.providerId : null,
        hospitalId: params.providerType === 'HOSPITAL' ? params.providerId : null,
        status: 'PENDING',
        assignedByUserId: params.actorUserId,
        matchScore: params.matchScore ?? null,
        expiresAt: params.expiresAt ?? null,
      },
    });

    if (lead.status === 'QUALIFIED') {
      await tx.lead.update({
        where: { id: params.leadId },
        data: { status: 'ASSIGNED' },
      });
    }

    await tx.leadHistory.create({
      data: {
        leadId: params.leadId,
        assignmentId: assignment.id,
        actorUserId: params.actorUserId,
        eventType: 'LEAD_ASSIGNED',
        fromStatus: lead.status,
        toStatus: 'ASSIGNED',
        reason: `Assigned to ${params.providerType}`,
      },
    });

    await recordAuditLog(
      {
        actorUserId: params.actorUserId,
        actorRole: params.actorRole,
        action: 'LEAD_ASSIGNED_TO_PROVIDER',
        resourceType: 'LeadAssignment',
        resourceId: assignment.id,
        metadata: {
          leadId: params.leadId,
          providerType: params.providerType,
          providerId: params.providerId,
        },
      },
      tx,
    );

    return assignment;
  });
}

/**
 * Allows an assigned provider to accept or reject a pending LeadAssignment transactionally.
 */
export async function respondToLeadAssignment(
  params: {
    actorUserId: string;
    actorRole: 'DOCTOR' | 'HOSPITAL';
    providerId: string;
    assignmentId: string;
    decision: 'ACCEPTED' | 'REJECTED';
    rejectionReason?: string;
  },
  db: PrismaClient = prisma,
) {
  return db.$transaction(async (tx) => {
    const assignment = await tx.leadAssignment.findUnique({
      where: { id: params.assignmentId },
      select: {
        id: true,
        leadId: true,
        providerType: true,
        doctorId: true,
        hospitalId: true,
        status: true,
      },
    });

    if (!assignment) {
      throw new LeadAssignmentError(404, 'ASSIGNMENT_NOT_FOUND', 'Assignment not found.');
    }

    const ownsAssignment =
      (params.actorRole === 'DOCTOR' &&
        assignment.providerType === 'DOCTOR' &&
        assignment.doctorId === params.providerId) ||
      (params.actorRole === 'HOSPITAL' &&
        assignment.providerType === 'HOSPITAL' &&
        assignment.hospitalId === params.providerId);

    if (!ownsAssignment) {
      throw new LeadAssignmentError(403, 'FORBIDDEN_ASSIGNMENT', 'Assignment belongs to another provider.');
    }

    if (assignment.status !== 'PENDING') {
      throw new LeadAssignmentError(
        409,
        'INVALID_ASSIGNMENT_STATE',
        `Cannot respond to assignment in status '${assignment.status}'.`,
      );
    }

    const now = new Date();
    const updated = await tx.leadAssignment.update({
      where: { id: assignment.id },
      data:
        params.decision === 'ACCEPTED'
          ? { status: 'ACCEPTED', acceptedAt: now }
          : {
              status: 'REJECTED',
              rejectedAt: now,
              rejectionReason: params.rejectionReason ?? 'Declined by provider',
            },
    });

    await tx.leadHistory.create({
      data: {
        leadId: assignment.leadId,
        assignmentId: assignment.id,
        actorUserId: params.actorUserId,
        eventType: params.decision === 'ACCEPTED' ? 'ASSIGNMENT_ACCEPTED' : 'ASSIGNMENT_REJECTED',
        reason: params.rejectionReason ?? null,
      },
    });

    await recordAuditLog(
      {
        actorUserId: params.actorUserId,
        actorRole: params.actorRole,
        action:
          params.decision === 'ACCEPTED'
            ? 'LEAD_ASSIGNMENT_ACCEPTED'
            : 'LEAD_ASSIGNMENT_REJECTED',
        resourceType: 'LeadAssignment',
        resourceId: assignment.id,
        metadata: { leadId: assignment.leadId },
      },
      tx,
    );

    return updated;
  });
}
