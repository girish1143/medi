import type { PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database';
import type { ProviderType } from '../../shared/constants';
import {
  ConflictError,
  ConsentRequiredError,
  ForbiddenError,
  NotFoundError,
} from '../../shared/errors';
import { recordAuditLog } from '../audit-logs/audit-log.service';

export class AssignmentService {
  constructor(private readonly db: PrismaClient = prisma) {}

  async assignLeadToProvider(params: {
    actorUserId: string;
    actorRole: string;
    leadId: string;
    providerType: ProviderType;
    providerId: string;
    matchScore?: number;
    expiresAt?: Date;
  }) {
    return this.db.$transaction(async (tx) => {
      const lead = await tx.lead.findUnique({
        where: { id: params.leadId },
        select: { id: true, status: true, archivedAt: true },
      });
      if (!lead || lead.archivedAt !== null) {
        throw new NotFoundError('LEAD_NOT_FOUND', 'Lead does not exist.');
      }
      if (lead.status !== 'QUALIFIED' && lead.status !== 'ASSIGNED') {
        throw new ConflictError(
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
        await recordAuditLog(
          {
            actorUserId: params.actorUserId,
            actorRole: params.actorRole,
            action: 'LEAD_ASSIGNMENT_DENIED_NO_CONSENT',
            resourceType: 'Lead',
            resourceId: params.leadId,
            outcome: 'DENIED',
          },
          tx,
        );
        throw new ConsentRequiredError(
          'Cannot assign lead without active patient contact disclosure consent.',
        );
      }

      if (params.providerType === 'DOCTOR') {
        const doctor = await tx.doctor.findUnique({
          where: { id: params.providerId },
          select: { id: true, verificationStatus: true, isAcceptingLeads: true, archivedAt: true },
        });
        if (
          !doctor ||
          doctor.archivedAt !== null ||
          doctor.verificationStatus !== 'VERIFIED' ||
          !doctor.isAcceptingLeads
        ) {
          throw new ConflictError(
            'PROVIDER_NOT_ELIGIBLE',
            'Target doctor must be verified and accepting leads.',
          );
        }
      } else {
        const hospital = await tx.hospital.findUnique({
          where: { id: params.providerId },
          select: { id: true, verificationStatus: true, isAcceptingLeads: true, archivedAt: true },
        });
        if (
          !hospital ||
          hospital.archivedAt !== null ||
          hospital.verificationStatus !== 'VERIFIED' ||
          !hospital.isAcceptingLeads
        ) {
          throw new ConflictError(
            'PROVIDER_NOT_ELIGIBLE',
            'Target hospital must be verified and accepting leads.',
          );
        }
      }

      const duplicate = await tx.leadAssignment.findFirst({
        where: {
          leadId: params.leadId,
          status: { in: ['PENDING', 'ACCEPTED'] },
          ...(params.providerType === 'DOCTOR'
            ? { doctorId: params.providerId }
            : { hospitalId: params.providerId }),
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictError(
          'DUPLICATE_ACTIVE_ASSIGNMENT',
          'Provider already holds an active assignment for this lead.',
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
          where: { id: lead.id },
          data: { status: 'ASSIGNED' },
        });
      }

      await tx.leadHistory.create({
        data: {
          leadId: lead.id,
          assignmentId: assignment.id,
          actorUserId: params.actorUserId,
          eventType: 'ASSIGNED',
          fromStatus: lead.status,
          toStatus: 'ASSIGNED',
          metadataJson: JSON.stringify({
            providerType: params.providerType,
            providerId: params.providerId,
          }),
        },
      });

      await recordAuditLog(
        {
          actorUserId: params.actorUserId,
          actorRole: params.actorRole,
          action: 'LEAD_ASSIGNED',
          resourceType: 'LeadAssignment',
          resourceId: assignment.id,
          metadata: { leadId: lead.id, providerType: params.providerType, providerId: params.providerId },
        },
        tx,
      );

      return assignment;
    });
  }

  async respondToAssignment(params: {
    assignmentId: string;
    actorUserId: string;
    actorRole: 'DOCTOR' | 'HOSPITAL';
    decision: 'ACCEPTED' | 'REJECTED';
    rejectionReason?: string;
  }) {
    return this.db.$transaction(async (tx) => {
      const providerId =
        params.actorRole === 'DOCTOR'
          ? (
              await tx.doctor.findUnique({
                where: { userId: params.actorUserId },
                select: { id: true },
              })
            )?.id
          : (
              await tx.hospital.findUnique({
                where: { userId: params.actorUserId },
                select: { id: true },
              })
            )?.id;

      if (!providerId) {
        throw new ForbiddenError('PROVIDER_PROFILE_REQUIRED', 'Verified provider profile required.');
      }

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
        throw new NotFoundError('ASSIGNMENT_NOT_FOUND', 'Lead assignment not found.');
      }

      const isOwner =
        (params.actorRole === 'DOCTOR' &&
          assignment.providerType === 'DOCTOR' &&
          assignment.doctorId === providerId) ||
        (params.actorRole === 'HOSPITAL' &&
          assignment.providerType === 'HOSPITAL' &&
          assignment.hospitalId === providerId);

      if (!isOwner) {
        throw new ForbiddenError(
          'FORBIDDEN_OWNERSHIP',
          'You cannot respond to an assignment belonging to another provider.',
        );
      }

      if (assignment.status !== 'PENDING') {
        throw new ConflictError(
          'INVALID_ASSIGNMENT_STATE',
          `Assignment in status '${assignment.status}' cannot be modified.`,
        );
      }

      const now = new Date();
      const updated = await tx.leadAssignment.update({
        where: { id: assignment.id },
        data: {
          status: params.decision,
          acceptedAt: params.decision === 'ACCEPTED' ? now : null,
          rejectedAt: params.decision === 'REJECTED' ? now : null,
          rejectionReason: params.decision === 'REJECTED' ? (params.rejectionReason ?? 'Declined') : null,
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
          action: `LEAD_ASSIGNMENT_${params.decision}`,
          resourceType: 'LeadAssignment',
          resourceId: assignment.id,
          metadata: { leadId: assignment.leadId },
        },
        tx,
      );

      return updated;
    });
  }
}
