import type { PrismaClient } from '@prisma/client';
import { prisma } from '../db/prisma';
import type { ConsentPurpose, ConsentProviderScope, ProviderType } from '../domain/enums';
import { recordAuditLog } from './audit.service';

export class ConsentViolationError extends Error {
  public readonly statusCode = 403;
  public readonly code = 'CONSENT_REQUIRED';

  constructor(message: string) {
    super(message);
    this.name = 'ConsentViolationError';
  }
}

export interface ProviderConsentCheckInput {
  leadId: string;
  providerType: ProviderType;
  providerId: string;
  requiredPurpose?: ConsentPurpose;
}

export interface ConsentedPatientContactDto {
  leadId: string;
  patientId: string;
  fullName: string;
  email: string;
  phone: string | null;
  preferredLanguage: string;
  city: string | null;
  stateProvince: string | null;
  countryCode: string | null;
  consentId: string;
  consentVersion: string;
}

/**
 * Checks whether an active, unrevoked, unexpired PatientConsent record authorizes
 * the target Doctor or Hospital for the specified Lead and purpose.
 */
export async function verifyValidLeadConsentForProvider(
  input: ProviderConsentCheckInput,
  db: PrismaClient = prisma,
): Promise<{ consentId: string; consentVersion: string } | null> {
  const now = new Date();
  const requiredPurpose = input.requiredPurpose ?? 'PROVIDER_CONTACT_DISCLOSURE';

  const consents = await db.patientConsent.findMany({
    where: {
      leadId: input.leadId,
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

  if (consents.length === 0) {
    return null;
  }

  for (const consent of consents) {
    if (
      consent.authorizedProviderScope === 'SPECIFIC_DOCTOR' &&
      input.providerType === 'DOCTOR' &&
      consent.authorizedDoctorId === input.providerId
    ) {
      return { consentId: consent.id, consentVersion: consent.consentVersion };
    }

    if (
      consent.authorizedProviderScope === 'SPECIFIC_HOSPITAL' &&
      input.providerType === 'HOSPITAL' &&
      consent.authorizedHospitalId === input.providerId
    ) {
      return { consentId: consent.id, consentVersion: consent.consentVersion };
    }

    if (consent.authorizedProviderScope === 'MATCHED_PROVIDERS') {
      const activeAssignment = await db.leadAssignment.findFirst({
        where: {
          leadId: input.leadId,
          providerType: input.providerType,
          status: { in: ['PENDING', 'ACCEPTED'] },
          ...(input.providerType === 'DOCTOR'
            ? { doctorId: input.providerId }
            : { hospitalId: input.providerId }),
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

/**
 * Enforces explicit consent + accepted assignment before returning patient contact details
 * to a Doctor or Hospital, recording every disclosure or denial in AuditLog.
 */
export async function getConsentedPatientContactForProvider(
  params: {
    actorUserId: string;
    actorRole: 'DOCTOR' | 'HOSPITAL';
    providerType: ProviderType;
    providerId: string;
    leadId: string;
  },
  db: PrismaClient = prisma,
): Promise<ConsentedPatientContactDto> {
  const acceptedAssignment = await db.leadAssignment.findFirst({
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
      db,
    );
    throw new ConsentViolationError(
      'An accepted lead assignment is required before viewing patient contact details.',
    );
  }

  const verifiedConsent = await verifyValidLeadConsentForProvider(
    {
      leadId: params.leadId,
      providerType: params.providerType,
      providerId: params.providerId,
      requiredPurpose: 'PROVIDER_CONTACT_DISCLOSURE',
    },
    db,
  );

  if (!verifiedConsent) {
    await recordAuditLog(
      {
        actorUserId: params.actorUserId,
        actorRole: params.actorRole,
        action: 'PATIENT_CONTACT_ACCESS_DENIED_NO_CONSENT',
        resourceType: 'Lead',
        resourceId: params.leadId,
        outcome: 'DENIED',
      },
      db,
    );
    throw new ConsentViolationError(
      'Active patient consent is missing or revoked for this lead.',
    );
  }

  const lead = await db.lead.findUnique({
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
          user: {
            select: {
              fullName: true,
              email: true,
              phone: true,
            },
          },
        },
      },
    },
  });

  if (!lead) {
    throw new ConsentViolationError('Lead record not found.');
  }

  await recordAuditLog(
    {
      actorUserId: params.actorUserId,
      actorRole: params.actorRole,
      action: 'PATIENT_CONTACT_DISCLOSED_TO_PROVIDER',
      resourceType: 'Lead',
      resourceId: params.leadId,
      outcome: 'SUCCESS',
      metadata: {
        consentId: verifiedConsent.consentId,
        consentVersion: verifiedConsent.consentVersion,
        providerType: params.providerType,
      },
    },
    db,
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
    consentId: verifiedConsent.consentId,
    consentVersion: verifiedConsent.consentVersion,
  };
}

/**
 * Records explicit patient consent for a lead inside an atomic transaction.
 */
export async function grantPatientLeadConsent(
  params: {
    actorUserId: string;
    patientId: string;
    leadId: string;
    consentPurpose: ConsentPurpose;
    authorizedProviderScope: ConsentProviderScope;
    authorizedDoctorId?: string;
    authorizedHospitalId?: string;
    consentVersion: string;
    expiresAt?: Date;
    ipHash?: string;
    userAgentHash?: string;
  },
  db: PrismaClient = prisma,
) {
  return db.$transaction(async (tx) => {
    const lead = await tx.lead.findFirst({
      where: { id: params.leadId, patientId: params.patientId, archivedAt: null },
      select: { id: true },
    });
    if (!lead) {
      throw new Error('Lead not found or does not belong to the patient.');
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
        metadata: {
          leadId: params.leadId,
          consentPurpose: params.consentPurpose,
          consentVersion: params.consentVersion,
        },
      },
      tx,
    );

    return consent;
  });
}

/**
 * Revokes an active consent and immediately revokes open lead assignments on that lead.
 */
export async function revokePatientLeadConsent(
  params: {
    actorUserId: string;
    patientId: string;
    consentId: string;
    revocationReason: string;
  },
  db: PrismaClient = prisma,
) {
  return db.$transaction(async (tx) => {
    const existing = await tx.patientConsent.findFirst({
      where: {
        id: params.consentId,
        patientId: params.patientId,
        status: 'GRANTED',
      },
      select: { id: true, leadId: true, consentPurpose: true },
    });

    if (!existing) {
      throw new Error('Active consent record not found for patient.');
    }

    const now = new Date();
    const updated = await tx.patientConsent.update({
      where: { id: existing.id },
      data: {
        status: 'REVOKED',
        revokedAt: now,
        revocationReason: params.revocationReason,
      },
    });

    if (existing.consentPurpose === 'PROVIDER_CONTACT_DISCLOSURE') {
      await tx.leadAssignment.updateMany({
        where: {
          leadId: existing.leadId,
          status: { in: ['PENDING', 'ACCEPTED'] },
        },
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
        metadata: {
          leadId: existing.leadId,
          consentPurpose: existing.consentPurpose,
        },
      },
      tx,
    );

    return updated;
  });
}
