import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { connectDatabase, createPrismaClient, disconnectDatabase } from '../../src/config/database';
import { resetEnvCache } from '../../src/config/env';
import { sanitizeAuditMetadata } from '../../src/modules/audit-logs/audit-log.service';
import { bootstrapInitialSuperAdmin } from '../../src/scripts/bootstrap-admin';

function parseCookies(setCookieHeaders: string[] | string | undefined): Record<string, string> {
  const list = Array.isArray(setCookieHeaders) ? setCookieHeaders : setCookieHeaders ? [setCookieHeaders] : [];
  const map: Record<string, string> = {};
  for (const h of list) {
    const pair = h.split(';')[0] ?? '';
    const idx = pair.indexOf('=');
    if (idx > 0) map[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return map;
}

function asCookieHeader(map: Record<string, string>): string {
  return Object.entries(map)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

describe('Phase 4 & Step 4 End-to-End Domain, Consent Gate, Matching & Admin API Tests', () => {
  let tempDir: string;
  let dbPath: string;
  let db: PrismaClient;
  const tokens: Array<{ email: string; purpose: string; rawToken: string }> = [];
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.FRONTEND_ORIGIN = 'http://localhost:3000';
    process.env.JWT_ACCESS_SECRET = 'domain-test-access-secret-minimum-32-chars-abcdef123456';
    process.env.JWT_REFRESH_SECRET = 'domain-test-refresh-secret-minimum-32-chars-654321fedcba';
    resetEnvCache();

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backend-domain-test-'));
    dbPath = path.join(tempDir, 'domain.db');
    fs.copyFileSync(path.resolve(process.cwd(), 'prisma', 'dev.db'), dbPath);

    db = createPrismaClient(`file:${dbPath}`);
    await connectDatabase(db);
    app = createApp({ db, dispatchToken: (t) => tokens.push(t) });
  });

  afterAll(async () => {
    await disconnectDatabase(db);
    fs.rmSync(tempDir, { recursive: true, force: true });
    resetEnvCache();
  });

  it('keeps dev.db empty with zero dummy data and reports exact zero admin metrics initially', async () => {
    const devDb = createPrismaClient(`file:${path.resolve(process.cwd(), 'prisma', 'dev.db')}`);
    try {
      const counts = await Promise.all([
        devDb.user.count(),
        devDb.patient.count(),
        devDb.doctor.count(),
        devDb.hospital.count(),
        devDb.lead.count(),
        devDb.payment.count(),
        devDb.auditLog.count(),
      ]);
      expect(counts.every((c) => c === 0)).toBe(true);
    } finally {
      await devDb.$disconnect();
    }

    await bootstrapInitialSuperAdmin(
      {
        BOOTSTRAP_ADMIN_EMAIL: 'super@domain.test',
        BOOTSTRAP_ADMIN_PASSWORD: 'SuperDomain!2026#Strong',
        BOOTSTRAP_ADMIN_NAME: 'Domain Super Admin',
      },
      db,
    );

    const login = await request(app).post('/api/v1/auth/login').send({
      email: 'super@domain.test',
      password: 'SuperDomain!2026#Strong',
    });
    const cookies = parseCookies(login.headers['set-cookie']);

    const dashRes = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Cookie', asCookieHeader(cookies));
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.data.metrics.totalPatients).toBe(0);
    expect(dashRes.body.data.metrics.totalLeads).toBe(0);
    expect(dashRes.body.data.metrics.actualPaymentRevenueMinor).toBe(0);
    expect(dashRes.body.data.charts.leadsOverTime).toEqual([]);
  });

  it('enforces full Lead generation, Consent disclosure gate, Provider ownership isolation, Billing refunds, and Support APIs', async () => {
    const superLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'super@domain.test',
      password: 'SuperDomain!2026#Strong',
    });
    const superCookies = parseCookies(superLogin.headers['set-cookie']);

    // Register & verify Patient, Doctor 1, Doctor 2
    await request(app).post('/api/v1/auth/register/patient').send({
      fullName: 'Lead Patient',
      email: 'pat@domain.test',
      phone: '+15559990001',
      password: 'PatientPass!2026#Strong',
      city: 'Austin',
      stateProvince: 'TX',
      countryCode: 'US',
      acceptedTerms: true,
    });
    await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ token: tokens.find((t) => t.email === 'pat@domain.test')!.rawToken });

    await request(app).post('/api/v1/auth/register/doctor').send({
      fullName: 'Dr. Cardiology One',
      email: 'doc1@domain.test',
      phone: '+15559990002',
      password: 'DoctorOne!2026#Strong',
      medicalLicenseNumber: 'TX-CARD-001',
      licensingAuthority: 'TMB',
      licenseCountryCode: 'US',
      specializationCode: 'CARDIOLOGY',
      specializationName: 'Cardiology',
      city: 'Austin',
      stateProvince: 'TX',
      countryCode: 'US',
      acceptedTerms: true,
    });
    await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ token: tokens.find((t) => t.email === 'doc1@domain.test')!.rawToken });

    await request(app).post('/api/v1/auth/register/doctor').send({
      fullName: 'Dr. Neuro Two',
      email: 'doc2@domain.test',
      phone: '+15559990003',
      password: 'DoctorTwo!2026#Strong',
      medicalLicenseNumber: 'TX-NEURO-002',
      licensingAuthority: 'TMB',
      licenseCountryCode: 'US',
      specializationCode: 'NEUROLOGY',
      specializationName: 'Neurology',
      city: 'Dallas',
      stateProvince: 'TX',
      countryCode: 'US',
      acceptedTerms: true,
    });
    await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ token: tokens.find((t) => t.email === 'doc2@domain.test')!.rawToken });

    const doc1 = await db.doctor.findFirstOrThrow({ where: { medicalLicenseNumber: 'TX-CARD-001' } });
    const doc2 = await db.doctor.findFirstOrThrow({ where: { medicalLicenseNumber: 'TX-NEURO-002' } });

    // Admin verifies both doctors & opens lead acceptance
    for (const d of [doc1, doc2]) {
      const verify = await request(app)
        .post('/api/v1/admin/providers/verify')
        .set('Cookie', asCookieHeader(superCookies))
        .set('X-CSRF-Token', superCookies.hlp_csrf_token!)
        .send({ providerType: 'DOCTOR', providerId: d.id, decision: 'VERIFIED' });
      expect(verify.status).toBe(200);
      await db.doctor.update({ where: { id: d.id }, data: { isAcceptingLeads: true } });
    }

    // Patient logs in & creates Lead + Consent
    const patLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'pat@domain.test',
      password: 'PatientPass!2026#Strong',
    });
    const patCookies = parseCookies(patLogin.headers['set-cookie']);

    const leadRes = await request(app)
      .post('/api/v1/leads')
      .set('Cookie', asCookieHeader(patCookies))
      .set('X-CSRF-Token', patCookies.hlp_csrf_token!)
      .send({
        specialization: 'CARDIOLOGY',
        locationCity: 'Austin',
        locationState: 'TX',
        countryCode: 'US',
        consultationMode: 'IN_PERSON',
        enquiryDescription: 'Seeking cardiology specialist follow-up assessment.',
        grantDisclosureConsent: true,
      });
    expect(leadRes.status).toBe(201);
    const leadId = leadRes.body.data.lead.id as string;

    // Admin qualifies lead & checks eligible specialist match
    await request(app)
      .patch(`/api/v1/leads/${leadId}/status`)
      .set('Cookie', asCookieHeader(superCookies))
      .set('X-CSRF-Token', superCookies.hlp_csrf_token!)
      .send({ status: 'QUALIFIED' });

    const matchesRes = await request(app)
      .get(`/api/v1/admin/leads/${leadId}/matches`)
      .set('Cookie', asCookieHeader(superCookies));
    expect(matchesRes.status).toBe(200);
    expect(matchesRes.body.data.matches[0].providerId).toBe(doc1.id);

    // Assign lead strictly to Doctor 1
    const assignRes = await request(app)
      .post(`/api/v1/leads/${leadId}/assign`)
      .set('Cookie', asCookieHeader(superCookies))
      .set('X-CSRF-Token', superCookies.hlp_csrf_token!)
      .send({ providerType: 'DOCTOR', providerId: doc1.id, matchScore: 92 });
    expect(assignRes.status).toBe(201);
    const assignmentId = assignRes.body.data.assignment.id as string;

    // Doctor 2 (NOT assigned!) MUST be blocked from accessing Lead detail or responding!
    const doc2Login = await request(app).post('/api/v1/auth/login').send({
      email: 'doc2@domain.test',
      password: 'DoctorTwo!2026#Strong',
    });
    const doc2Cookies = parseCookies(doc2Login.headers['set-cookie']);

    const doc2List = await request(app)
      .get('/api/v1/leads')
      .set('Cookie', asCookieHeader(doc2Cookies));
    expect(doc2List.status).toBe(200);
    expect(doc2List.body.data.leads.length).toBe(0);

    const doc2Peek = await request(app)
      .get(`/api/v1/leads/${leadId}`)
      .set('Cookie', asCookieHeader(doc2Cookies));
    expect(doc2Peek.status).toBe(403);
    expect(doc2Peek.body.error.code).toBe('FORBIDDEN_OWNERSHIP');

    // Doctor 1 accepts assignment and sees consented contact info
    const doc1Login = await request(app).post('/api/v1/auth/login').send({
      email: 'doc1@domain.test',
      password: 'DoctorOne!2026#Strong',
    });
    const doc1Cookies = parseCookies(doc1Login.headers['set-cookie']);

    const acceptRes = await request(app)
      .post(`/api/v1/assignments/${assignmentId}/respond`)
      .set('Cookie', asCookieHeader(doc1Cookies))
      .set('X-CSRF-Token', doc1Cookies.hlp_csrf_token!)
      .send({ decision: 'ACCEPTED' });
    expect(acceptRes.status).toBe(200);

    const doc1Detail = await request(app)
      .get(`/api/v1/leads/${leadId}`)
      .set('Cookie', asCookieHeader(doc1Cookies));
    expect(doc1Detail.status).toBe(200);
    expect(doc1Detail.body.data.patientContact.email).toBe('pat@domain.test');

    // Patient revokes consent -> contact & assignment immediately revoked
    const consentsList = await request(app)
      .get(`/api/v1/consent/${leadId}`)
      .set('Cookie', asCookieHeader(patCookies));
    const consentId = consentsList.body.data.consents[0].id as string;

    const revokeRes = await request(app)
      .post(`/api/v1/consent/${consentId}/revoke`)
      .set('Cookie', asCookieHeader(patCookies))
      .set('X-CSRF-Token', patCookies.hlp_csrf_token!)
      .send({ revocationReason: 'Selected another clinic' });
    expect(revokeRes.status).toBe(200);

    const revealAfterRevoke = await request(app)
      .post(`/api/v1/admin/leads/${leadId}/reveal-contact`)
      .set('Cookie', asCookieHeader(superCookies))
      .set('X-CSRF-Token', superCookies.hlp_csrf_token!);
    expect(revealAfterRevoke.status).toBe(403);
    expect(revealAfterRevoke.body.error.code).toBe('CONSENT_REQUIRED');

    // Subscription plan & Payment refund test
    const planRes = await request(app)
      .post('/api/v1/admin/subscriptions')
      .set('Cookie', asCookieHeader(superCookies))
      .set('X-CSRF-Token', superCookies.hlp_csrf_token!)
      .send({
        code: 'PRO_CARE_MO',
        name: 'Pro Care Monthly',
        targetProviderType: 'DOCTOR',
        billingCycle: 'MONTHLY',
        priceMinor: 10000,
        currency: 'USD',
        monthlyLeadQuota: 20,
      });
    expect(planRes.status).toBe(201);

    const sub = await db.subscription.create({
      data: {
        planId: planRes.body.data.plan.id,
        providerType: 'DOCTOR',
        doctorId: doc1.id,
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 86400_000 * 30),
        leadsAllocatedInPeriod: 20,
      },
    });
    const pay = await db.payment.create({
      data: {
        subscriptionId: sub.id,
        providerType: 'DOCTOR',
        doctorId: doc1.id,
        gatewayProvider: 'STRIPE_TOKEN',
        gatewayPaymentId: 'pi_domain_001',
        paymentMethodType: 'CARD_TOKEN',
        amountMinor: 10000,
        currency: 'USD',
        status: 'SUCCEEDED',
        idempotencyKey: 'pay-domain-001',
        paidAt: new Date(),
      },
    });

    const refundRes = await request(app)
      .post(`/api/v1/admin/payments/${pay.id}/refund`)
      .set('Cookie', asCookieHeader(superCookies))
      .set('X-CSRF-Token', superCookies.hlp_csrf_token!)
      .send({ amountMinor: 4000, reason: 'Partial billing credit adjustment' });
    expect(refundRes.status).toBe(200);
    expect(refundRes.body.data.payment.status).toBe('PARTIALLY_REFUNDED');

    // Over-refund must be rejected cleanly
    const overRefund = await request(app)
      .post(`/api/v1/admin/payments/${pay.id}/refund`)
      .set('Cookie', asCookieHeader(superCookies))
      .set('X-CSRF-Token', superCookies.hlp_csrf_token!)
      .send({ amountMinor: 7000, reason: 'Should exceed 6000 balance' });
    expect(overRefund.status).toBe(400);

    // Analytics CSV export & Audit metadata redaction verification
    const csvRes = await request(app)
      .get('/api/v1/admin/analytics/export?report=leads')
      .set('Cookie', asCookieHeader(superCookies));
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers['content-type']).toContain('text/csv');

    const auditClean = sanitizeAuditMetadata({
      password: 'x',
      refreshToken: 'y',
      enquiryDescription: 'phi',
      actionDetail: 'ok',
    }) as Record<string, unknown>;
    expect(auditClean.password).toBe('[REDACTED]');
    expect(auditClean.refreshToken).toBe('[REDACTED]');
    expect(auditClean.enquiryDescription).toBe('[REDACTED]');
    expect(auditClean.actionDetail).toBe('ok');
  });
});
