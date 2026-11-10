import type { PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database';
import type { ConsentPurpose, ConsentProviderScope, ProviderType } from '../../shared/constants';
import { ConsentRequiredError, NotFoundError } from '../../shared/errors';
import { recordAuditLog } from '../audit-logs/audit-log.service';

export class ConsentService {
  constructor(private readonly db: PrismaClient = prisma) {}

  async verifyValidLeadConsentForProvider(params: {
    leadId: string;
    providerType: ProviderType;
    providerId: string;
    requiredPurpose?: ConsentPurpose;
  }): Promise<{ consentId: string; consentVersion: string } | null> {
    const now = new Date();
    const requiredPurpose = params.requiredPurpose ?? 'PROVIDER_CONTACT_DISCLOSURE';

    const consents = await this.db.patientConsent.findMany({
      where: {
        leadId: params.leadId,
        consentPurpose: requiredPurpose,
        status: 'GRANTED',
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { grantedAt: 'desc' },
      select: {
        id: true,
        consentVersion: true,
        authorizedProviderScope: true,
        authorizedDoctorId: true,
        authorizedHospitalId: true,
      },
    });

    for (const consent of consents) {
      if (
        consent.authorizedProviderScope === 'SPECIFIC_DOCTOR' &&
        params.providerType === 'DOCTOR' &&
        consent.authorizedDoctorId === params.providerId
      ) {
        return { consentId: consent.id, consentVersion: consent.consentVersion };
      }

      if (
        consent.authorizedProviderScope === 'SPECIFIC_HOSPITAL' &&
        params.providerType === 'HOSPITAL' &&
        consent.authorizedHospitalId === params.providerId
      ) {
        return { consentId: consent.id, consentVersion: consent.consentVersion };
      }

      if (consent.authorizedProviderScope === 'MATCHED_PROVIDERS') {
        const activeAssignment = await this.db.leadAssignment.findFirst({
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
        if (activeAssignment) {
          return { consentId: consent.id, consentVersion: consent.consentVersion };
        }
      }
    }

    return null;
  }

  async getConsentedPatientContactForProvider(params: {
    actorUserId: string;
    actorRole: 'DOCTOR' | 'HOSPITAL';
    providerType: ProviderType;
    providerId: string;
    leadId: string;
  }) {
    const acceptedAssignment = await this.db.leadAssignment.findFirst({
      where: {
        leadId: params.leadId,
        providerType: params.providerType,
        status: 'ACCEPTED',
        ...(params.providerType === 'DOCTOR'
          ? { doctorId: params.providerId }
          : { hospitalId: params.providerId }),
      },
      select: { id: true },
    });

    if (!acceptedAssignment) {
      await recordAuditLog(
        {
          actorUserId: params.actorUserId,
          actorRole: params.actorRole,
          action: 'PATIENT_CONTACT_ACCESS_DENIED_NO_ACCEPTED_ASSIGNMENT',
          resourceType: 'Lead',
          resourceId: params.leadId,
          outcome: 'DENIED',
        },
        this.db,
      );
      throw new ConsentRequiredError(
        'An accepted lead assignment is required before viewing patient contact details.',
      );
    }

    const consent = await this.verifyValidLeadConsentForProvider({
      leadId: params.leadId,
      providerType: params.providerType,
      providerId: params.providerId,
    });

    if (!consent) {
      await recordAuditLog(
        {
          actorUserId: params.actorUserId,
          actorRole: params.actorRole,
          action: 'PATIENT_CONTACT_ACCESS_DENIED_NO_CONSENT',
          resourceType: 'Lead',
          resourceId: params.leadId,
          outcome: 'DENIED',
        },
        this.db,
      );
      throw new ConsentRequiredError('Active patient consent is missing or revoked for this lead.');
    }

    const lead = await this.db.lead.findUnique({
      where: { id: params.leadId },
      select: {
        id: true,
        patient: {
          select: {
            id: true,
            preferredLanguage: true,
            city: true,
            stateProvince: true,
            countryCode: true,
            user: { select: { fullName: true, email: true, phone: true } },
          },
        },
      },
    });
    if (!lead) {
      throw new NotFoundError('LEAD_NOT_FOUND', 'Lead not found.');
    }

    await recordAuditLog(
      {
        actorUserId: params.actorUserId,
        actorRole: params.actorRole,
        action: 'PATIENT_CONTACT_DISCLOSED',
        resourceType: 'Patient',
        resourceId: lead.patient.id,
        metadata: { leadId: lead.id, consentId: consent.consentId },
      },
      this.db,
    );

    return {
      leadId: lead.id,
      patientId: lead.patient.id,
      fullName: lead.patient.user.fullName,
      email: lead.patient.user.email,
      phone: lead.patient.user.phone,
      preferredLanguage: lead.patient.preferredLanguage,
      city: lead.patient.city,
      stateProvince: lead.patient.stateProvince,
      countryCode: lead.patient.countryCode,
      consentId: consent.consentId,
      consentVersion: consent.consentVersion,
    };
  }

  async grantConsent(params: {
    actorUserId: string;
    patientId: string;
    leadId: string;
    consentPurpose: ConsentPurpose;
    authorizedProviderScope: ConsentProviderScope;
    authorizedDoctorId?: string;
    authorizedHospitalId?: string;
    consentVersion: string;
    expiresAt?: Date;
    ipHash?: string | null;
    userAgentHash?: string | null;
  }) {
    return this.db.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({
        where: { id: params.leadId, patientId: params.patientId, archivedAt: null },
        select: { id: true },
      });
      if (!lead) {
        throw new NotFoundError('LEAD_NOT_FOUND', 'Lead not found for this patient.');
      }

      const consent = await tx.patientConsent.create({
        data: {
          patientId: params.patientId,
          leadId: params.leadId,
          consentPurpose: params.consentPurpose,
          authorizedProviderScope: params.authorizedProviderScope,
          authorizedDoctorId: params.authorizedDoctorId ?? null,
          authorizedHospitalId: params.authorizedHospitalId ?? null,
          status: 'GRANTED',
          consentVersion: params.consentVersion,
          expiresAt: params.expiresAt ?? null,
          ipHash: params.ipHash ?? null,
          userAgentHash: params.userAgentHash ?? null,
        },
      });

      await tx.leadHistory.create({
        data: {
          leadId: params.leadId,
          actorUserId: params.actorUserId,
          eventType: 'CONSENT_GRANTED',
          reason: `Consent (${params.consentPurpose}, ${params.consentVersion}) granted`,
        },
      });

      await recordAuditLog(
        {
          actorUserId: params.actorUserId,
          actorRole: 'PATIENT',
          action: 'PATIENT_CONSENT_GRANTED',
          resourceType: 'PatientConsent',
          resourceId: consent.id,
          metadata: { leadId: params.leadId, consentPurpose: params.consentPurpose },
        },
        tx,
      );

      return consent;
    });
  }

  async revokeConsent(params: {
    actorUserId: string;
    patientId: string;
    consentId: string;
    revocationReason: string;
  }) {
    return this.db.$transaction(async (tx) => {
      const existing = await tx.patientConsent.findFirst({
        where: { id: params.consentId, patientId: params.patientId, status: 'GRANTED' },
        select: { id: true, leadId: true, consentPurpose: true },
      });
      if (!existing) {
        throw new NotFoundError('CONSENT_NOT_FOUND', 'Active consent record not found.');
      }

      const now = new Date();
      const updated = await tx.patientConsent.update({
        where: { id: existing.id },
        data: { status: 'REVOKED', revokedAt: now, revocationReason: params.revocationReason },
      });

      if (existing.consentPurpose === 'PROVIDER_CONTACT_DISCLOSURE') {
        await tx.leadAssignment.updateMany({
          where: { leadId: existing.leadId, status: { in: ['PENDING', 'ACCEPTED'] } },
          data: {
            status: 'REVOKED',
            rejectedAt: now,
            rejectionReason: 'Patient revoked disclosure consent.',
          },
        });
      }

      await tx.leadHistory.create({
        data: {
          leadId: existing.leadId,
          actorUserId: params.actorUserId,
          eventType: 'CONSENT_REVOKED',
          reason: params.revocationReason,
        },
      });

      await recordAuditLog(
        {
          actorUserId: params.actorUserId,
          actorRole: 'PATIENT',
          action: 'PATIENT_CONSENT_REVOKED',
          resourceType: 'PatientConsent',
          resourceId: existing.id,
          metadata: { leadId: existing.leadId, revocationReason: params.revocationReason },
        },
        tx,
      );

      return updated;
    });
  }
}
