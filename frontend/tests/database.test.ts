import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { GET as healthGet } from '../src/app/api/health/route';
import { hashPassword, verifyPassword } from '../src/lib/auth/password';
import { prisma as appPrisma, verifyDatabaseConnectivity } from '../src/lib/db/prisma';
import { sanitizeAuditMetadata } from '../src/lib/services/audit.service';
import {
  ConsentViolationError,
  getConsentedPatientContactForProvider,
  grantPatientLeadConsent,
  revokePatientLeadConsent,
} from '../src/lib/services/consent.service';
import {
  assignLeadToProvider,
  LeadAssignmentError,
  respondToLeadAssignment,
} from '../src/lib/services/lead-assignment.service';

describe('Database Connectivity & Zero-Seed State (platform.db)', () => {
  after(async () => {
    await appPrisma.$disconnect();
  });

  it('connects to SQLite via reusable Prisma client', async () => {
    const connected = await verifyDatabaseConnectivity();
    assert.equal(connected, true);
  });

  it('serves /api/health endpoint verifying SQLite connectivity without leaking credentials', async () => {
    const response = await healthGet();
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      success: boolean;
      data: { status: string; database: string };
    };
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'ok');
    assert.equal(body.data.database, 'connected');
    assert.equal(JSON.stringify(body).includes('platform.db'), false);
  });

  it('initializes all 20 models completely empty (no dummy data)', async () => {
    const counts = await Promise.all([
      appPrisma.user.count(),
      appPrisma.adminRole.count(),
      appPrisma.adminPermission.count(),
      appPrisma.adminRolePermission.count(),
      appPrisma.patient.count(),
      appPrisma.doctor.count(),
      appPrisma.hospital.count(),
      appPrisma.hospitalDepartment.count(),
      appPrisma.doctorSpecialization.count(),
      appPrisma.lead.count(),
      appPrisma.leadAssignment.count(),
      appPrisma.leadHistory.count(),
      appPrisma.patientConsent.count(),
      appPrisma.subscriptionPlan.count(),
      appPrisma.subscription.count(),
      appPrisma.payment.count(),
      appPrisma.invoice.count(),
      appPrisma.notification.count(),
      appPrisma.supportTicket.count(),
      appPrisma.auditLog.count(),
    ]);

    assert.equal(counts.length, 20);
    assert.ok(counts.every((count) => count === 0));
  });
});

describe('Schema Constraints, Consent Gate & Transactional Logic (Isolated Ephemeral Copy)', () => {
  let tempDir: string;
  let tempDbPath: string;
  let testPrisma: PrismaClient;

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hospital-db-test-'));
    tempDbPath = path.join(tempDir, 'test.db');
    const sourceDbPath = path.resolve(process.cwd(), 'prisma', 'platform.db');
    fs.copyFileSync(sourceDbPath, tempDbPath);

    testPrisma = new PrismaClient({
      datasources: {
        db: { url: `file:${tempDbPath}` },
      },
    });
    await testPrisma.$connect();
    await testPrisma.$executeRawUnsafe('PRAGMA foreign_keys = ON;');
  });

  after(async () => {
    await testPrisma.$disconnect();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('enforces SQLite CHECK constraints on domain enum columns', async () => {
    await assert.rejects(
      () =>
        testPrisma.user.create({
          data: {
            email: 'invalid-role-check@example.test',
            fullName: 'Check User',
            role: 'INVALID_ROLE',
          },
        }),
      /CHECK constraint failed/,
    );
  });

  it('enforces XOR provider constraint and prevents duplicate active LeadAssignments', async () => {
    const patientUser = await testPrisma.user.create({
      data: {
        email: 'patient-constraint@example.test',
        fullName: 'Constraint Patient',
        role: 'PATIENT',
        accountStatus: 'ACTIVE',
      },
    });
    const patient = await testPrisma.patient.create({
      data: { userId: patientUser.id },
    });

    const doctorUser = await testPrisma.user.create({
      data: {
        email: 'doctor-constraint@example.test',
        fullName: 'Constraint Doctor',
        role: 'DOCTOR',
        accountStatus: 'ACTIVE',
      },
    });
    const doctor = await testPrisma.doctor.create({
      data: {
        userId: doctorUser.id,
        medicalLicenseNumber: 'LIC-TEST-001',
        licensingAuthority: 'Medical Council',
        licenseCountryCode: 'IN',
        verificationStatus: 'VERIFIED',
        isAcceptingLeads: true,
        city: 'Bengaluru',
        stateProvince: 'Karnataka',
        countryCode: 'IN',
      },
    });

    const lead = await testPrisma.lead.create({
      data: {
        patientId: patient.id,
        specialization: 'CARDIOLOGY',
        locationCity: 'Bengaluru',
        locationState: 'Karnataka',
        countryCode: 'IN',
        enquiryDescription: 'Routine cardiology consultation check.',
        idempotencyKey: 'idem-001',
        status: 'QUALIFIED',
      },
    });

    await assert.rejects(
      () =>
        testPrisma.leadAssignment.create({
          data: {
            leadId: lead.id,
            providerType: 'DOCTOR',
            doctorId: null,
            hospitalId: null,
          },
        }),
      /CHECK constraint failed/,
    );

    await testPrisma.leadAssignment.create({
      data: {
        leadId: lead.id,
        providerType: 'DOCTOR',
        doctorId: doctor.id,
        status: 'PENDING',
      },
    });

    await assert.rejects(
      () =>
        testPrisma.leadAssignment.create({
          data: {
            leadId: lead.id,
            providerType: 'DOCTOR',
            doctorId: doctor.id,
            status: 'PENDING',
          },
        }),
      /Unique constraint failed/i,
    );
  });

  it('enforces explicit PatientConsent before provider contact disclosure and revokes immediately', async () => {
    const opsUser = await testPrisma.user.create({
      data: {
        email: 'ops-flow@example.test',
        fullName: 'Ops User',
        role: 'OPERATIONS_ADMIN',
        accountStatus: 'ACTIVE',
      },
    });
    const patientUser = await testPrisma.user.create({
      data: {
        email: 'patient-flow@example.test',
        phone: '+919900000001',
        fullName: 'Consent Patient',
        role: 'PATIENT',
        accountStatus: 'ACTIVE',
      },
    });
    const patient = await testPrisma.patient.create({
      data: {
        userId: patientUser.id,
        city: 'Mumbai',
        stateProvince: 'Maharashtra',
        countryCode: 'IN',
      },
    });
    const doctorUser = await testPrisma.user.create({
      data: {
        email: 'doctor-flow@example.test',
        fullName: 'Consent Doctor',
        role: 'DOCTOR',
        accountStatus: 'ACTIVE',
      },
    });
    const doctor = await testPrisma.doctor.create({
      data: {
        userId: doctorUser.id,
        medicalLicenseNumber: 'LIC-FLOW-002',
        licensingAuthority: 'Medical Council',
        licenseCountryCode: 'IN',
        verificationStatus: 'VERIFIED',
        isAcceptingLeads: true,
        city: 'Mumbai',
        stateProvince: 'Maharashtra',
        countryCode: 'IN',
      },
    });

    const lead = await testPrisma.lead.create({
      data: {
        patientId: patient.id,
        specialization: 'ORTHOPEDICS',
        locationCity: 'Mumbai',
        locationState: 'Maharashtra',
        countryCode: 'IN',
        enquiryDescription: 'Knee pain specialist consultation.',
        idempotencyKey: 'idem-flow-001',
        status: 'QUALIFIED',
      },
    });

    // Cannot assign before consent is granted
    await assert.rejects(
      () =>
        assignLeadToProvider(
          {
            actorUserId: opsUser.id,
            actorRole: 'OPERATIONS_ADMIN',
            leadId: lead.id,
            providerType: 'DOCTOR',
            providerId: doctor.id,
          },
          testPrisma,
        ),
      (err: unknown) => err instanceof LeadAssignmentError && err.code === 'CONSENT_REQUIRED',
    );

    const consent = await grantPatientLeadConsent(
      {
        actorUserId: patientUser.id,
        patientId: patient.id,
        leadId: lead.id,
        consentPurpose: 'PROVIDER_CONTACT_DISCLOSURE',
        authorizedProviderScope: 'MATCHED_PROVIDERS',
        consentVersion: 'v1.0',
      },
      testPrisma,
    );

    const assignment = await assignLeadToProvider(
      {
        actorUserId: opsUser.id,
        actorRole: 'OPERATIONS_ADMIN',
        leadId: lead.id,
        providerType: 'DOCTOR',
        providerId: doctor.id,
      },
      testPrisma,
    );

    // Contact details blocked while assignment is still PENDING
    await assert.rejects(
      () =>
        getConsentedPatientContactForProvider(
          {
            actorUserId: doctorUser.id,
            actorRole: 'DOCTOR',
            providerType: 'DOCTOR',
            providerId: doctor.id,
            leadId: lead.id,
          },
          testPrisma,
        ),
      ConsentViolationError,
    );

    await respondToLeadAssignment(
      {
        actorUserId: doctorUser.id,
        actorRole: 'DOCTOR',
        providerId: doctor.id,
        assignmentId: assignment.id,
        decision: 'ACCEPTED',
      },
      testPrisma,
    );

    const contact = await getConsentedPatientContactForProvider(
      {
        actorUserId: doctorUser.id,
        actorRole: 'DOCTOR',
        providerType: 'DOCTOR',
        providerId: doctor.id,
        leadId: lead.id,
      },
      testPrisma,
    );
    assert.equal(contact.email, 'patient-flow@example.test');
    assert.equal(contact.phone, '+919900000001');

    // Revoking consent immediately revokes active assignment & blocks contact access
    await revokePatientLeadConsent(
      {
        actorUserId: patientUser.id,
        patientId: patient.id,
        consentId: consent.id,
        revocationReason: 'Patient cancelled request',
      },
      testPrisma,
    );

    await assert.rejects(
      () =>
        getConsentedPatientContactForProvider(
          {
            actorUserId: doctorUser.id,
            actorRole: 'DOCTOR',
            providerType: 'DOCTOR',
            providerId: doctor.id,
            leadId: lead.id,
          },
          testPrisma,
        ),
      ConsentViolationError,
    );
  });

  it('hashes passwords securely and validates minimum length', async () => {
    await assert.rejects(() => hashPassword('short'), /at least 12 characters/);

    const hashed = await hashPassword('StrongPassphrase!2026');
    assert.notEqual(hashed, 'StrongPassphrase!2026');
    assert.equal(await verifyPassword('StrongPassphrase!2026', hashed), true);
    assert.equal(await verifyPassword('WrongPassphrase!2026', hashed), false);
  });

  it('redacts sensitive metadata keys before writing AuditLog', () => {
    const clean = sanitizeAuditMetadata({
      actionType: 'consent_check',
      passwordHash: '$2a$12$hidden',
      cardNumber: '4111',
      cvv: '999',
      enquiryDescription: 'private clinical note',
      safeCount: 1,
    }) as Record<string, unknown>;

    assert.equal(clean.actionType, 'consent_check');
    assert.equal(clean.passwordHash, '[REDACTED]');
    assert.equal(clean.cardNumber, '[REDACTED]');
    assert.equal(clean.cvv, '[REDACTED]');
    assert.equal(clean.enquiryDescription, '[REDACTED]');
    assert.equal(clean.safeCount, 1);
  });
});
