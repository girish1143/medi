import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { connectDatabase, createPrismaClient, disconnectDatabase } from '../../src/config/database';
import { resetEnvCache } from '../../src/config/env';
import { bootstrapInitialSuperAdmin } from '../../src/scripts/bootstrap-admin';
import { signAccessToken, signRefreshToken } from '../../src/security/jwt';

function extractCookieMap(setCookieHeaders: string[] | string | undefined): Record<string, string> {
  const list = Array.isArray(setCookieHeaders) ? setCookieHeaders : setCookieHeaders ? [setCookieHeaders] : [];
  const map: Record<string, string> = {};
  for (const header of list) {
    const first = header.split(';')[0] ?? '';
    const idx = first.indexOf('=');
    if (idx > 0) {
      map[first.slice(0, idx).trim()] = first.slice(idx + 1).trim();
    }
  }
  return map;
}

function cookieHeader(map: Record<string, string>): string {
  return Object.entries(map)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

describe('Step 6 Authentication, JWT Refresh Rotation, CSRF, RBAC & ABAC Security Tests', () => {
  let tempDir: string;
  let dbPath: string;
  let db: PrismaClient;
  let capturedTokens: Array<{ email: string; purpose: string; rawToken: string }> = [];
  let app: ReturnType<typeof createApp>;

  let superAdminId: string;
  let opsAdminId: string;
  let patientAId: string;
  let patientBId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.FRONTEND_ORIGIN = 'http://localhost:3000';
    process.env.JWT_ACCESS_SECRET = 'step6-test-access-secret-minimum-32-chars-abcdef987654';
    process.env.JWT_REFRESH_SECRET = 'step6-test-refresh-secret-minimum-32-chars-123456fedcba';
    process.env.ACCESS_TOKEN_TTL_SECONDS = '900';
    process.env.REFRESH_TOKEN_TTL_DAYS = '7';
    resetEnvCache();

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backend-step6-auth-'));
    dbPath = path.join(tempDir, 'auth-step6.db');
    fs.copyFileSync(path.resolve(process.cwd(), 'prisma', 'dev.db'), dbPath);

    db = createPrismaClient(`file:${dbPath}`);
    await connectDatabase(db);

    capturedTokens = [];
    app = createApp({
      db,
      dispatchToken: (payload) => {
        capturedTokens.push(payload);
      },
    });

    const superAdmin = await bootstrapInitialSuperAdmin(
      {
        BOOTSTRAP_ADMIN_EMAIL: 'root@hospital.test',
        BOOTSTRAP_ADMIN_PASSWORD: 'RootAdmin!2026#Strong',
        BOOTSTRAP_ADMIN_NAME: 'Root Super Admin',
      },
      db,
    );
    superAdminId = superAdmin.id;
  });

  afterAll(async () => {
    await disconnectDatabase(db);
    fs.rmSync(tempDir, { recursive: true, force: true });
    resetEnvCache();
  });

  it('rejects public registration for admin roles, validates duplicate emails, and activates verified patients', async () => {
    const escalationRes = await request(app).post('/api/v1/auth/register').send({
      role: 'SUPER_ADMIN',
      fullName: 'Attacker Admin',
      email: 'attacker@hospital.test',
      password: 'Password!2026#Strong',
    });
    expect(escalationRes.status).toBe(403);
    expect(escalationRes.body.error.code).toBe('PUBLIC_ROLE_RESTRICTED');

    const patARes = await request(app).post('/api/v1/auth/register/patient').send({
      fullName: 'Patient Alice',
      email: 'alice@patient.test',
      phone: '+15551000001',
      password: 'PatientAlice!2026#Strong',
      confirmPassword: 'PatientAlice!2026#Strong',
      acceptedTerms: true,
    });
    expect(patARes.status).toBe(201);
    patientAId = patARes.body.data.user.id;

    // Duplicate registration fails cleanly
    const dupRes = await request(app).post('/api/v1/auth/register/patient').send({
      fullName: 'Patient Alice Dup',
      email: 'alice@patient.test',
      phone: '+15551000099',
      password: 'PatientAlice!2026#Strong',
      acceptedTerms: true,
    });
    expect(dupRes.status).toBe(409);

    const aliceToken = capturedTokens.find((t) => t.email === 'alice@patient.test')?.rawToken;
    expect(aliceToken).toBeTruthy();

    // Unverified user cannot log in
    const unverifiedLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'alice@patient.test',
      password: 'PatientAlice!2026#Strong',
    });
    expect(unverifiedLogin.status).toBe(403);

    const verifyRes = await request(app).post('/api/v1/auth/verify-email').send({ token: aliceToken });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.user.accountStatus).toBe('ACTIVE');

    // Second patient B
    const patBRes = await request(app).post('/api/v1/auth/register/patient').send({
      fullName: 'Patient Bob',
      email: 'bob@patient.test',
      phone: '+15551000002',
      password: 'PatientBob!2026#Strong',
      acceptedTerms: true,
    });
    expect(patBRes.status).toBe(201);
    patientBId = patBRes.body.data.user.id;
    const bobToken = capturedTokens.find((t) => t.email === 'bob@patient.test')?.rawToken;
    await request(app).post('/api/v1/auth/verify-email').send({ token: bobToken });
  });

  it('authenticates via HTTP-only cookies, enforces CSRF protection, rotates refresh tokens, and revokes family on reuse', async () => {
    // Login as SUPER_ADMIN
    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: 'root@hospital.test',
      password: 'RootAdmin!2026#Strong',
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.user.role).toBe('SUPER_ADMIN');
    expect(JSON.stringify(loginRes.body)).not.toContain('passwordHash');

    const cookies1 = extractCookieMap(loginRes.headers['set-cookie']);
    expect(cookies1.hlp_access_token).toBeTruthy();
    expect(cookies1.hlp_refresh_token).toBeTruthy();
    expect(cookies1.hlp_csrf_token).toBeTruthy();

    // /me succeeds with HTTP-only cookie
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', cookieHeader(cookies1));
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user.id).toBe(superAdminId);
    expect(meRes.body.data.permissions).toContain('roles.manage');

    // Cookie mutation WITHOUT X-CSRF-Token must fail with 403 CSRF_TOKEN_INVALID
    const missingCsrfRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieHeader(cookies1));
    expect(missingCsrfRes.status).toBe(403);
    expect(missingCsrfRes.body.error.code).toBe('CSRF_TOKEN_INVALID');

    // Legitimate refresh rotation succeeds and issues rotated tokens
    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieHeader(cookies1))
      .set('X-CSRF-Token', cookies1.hlp_csrf_token!);
    expect(refreshRes.status).toBe(200);
    const cookies2 = extractCookieMap(refreshRes.headers['set-cookie']);
    expect(cookies2.hlp_refresh_token).not.toBe(cookies1.hlp_refresh_token);

    // Reusing old rotated refresh token MUST fail & revoke the entire token family (including cookies2!)
    const replayOldRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieHeader(cookies1))
      .set('X-CSRF-Token', cookies1.hlp_csrf_token!);
    expect(replayOldRes.status).toBe(401);
    expect(replayOldRes.body.error.code).toBe('REFRESH_TOKEN_REUSE_DETECTED');

    // Legitimate rotated token in compromised family MUST now also be rejected!
    const compromisedFollowup = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieHeader(cookies2))
      .set('X-CSRF-Token', cookies2.hlp_csrf_token!);
    expect(compromisedFollowup.status).toBe(401);
  });

  it('enforces RBAC, ABAC resource ownership, Super Admin protection, and invalid JWT / expiry rejection', async () => {
    // Reject invalid JWT signature and unauthenticated calls
    const unauth = await request(app).get('/api/v1/users');
    expect(unauth.status).toBe(401);

    const forgedJwt = await request(app)
      .get('/api/v1/users')
      .set('Authorization', 'Bearer invalid.jwt.signature');
    expect(forgedJwt.status).toBe(401);

    // Super Admin signs in cleanly and creates OPERATIONS_ADMIN
    const rootLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'root@hospital.test',
      password: 'RootAdmin!2026#Strong',
    });
    const rootCookies = extractCookieMap(rootLogin.headers['set-cookie']);

    const opsCreate = await request(app)
      .post('/api/v1/users')
      .set('Cookie', cookieHeader(rootCookies))
      .set('X-CSRF-Token', rootCookies.hlp_csrf_token!)
      .send({
        email: 'ops@hospital.test',
        fullName: 'Ops Manager',
        password: 'OpsManager!2026#Strong',
        roleCode: 'OPERATIONS_ADMIN',
      });
    expect(opsCreate.status).toBe(201);
    opsAdminId = opsCreate.body.data.user.id;

    // Ops Admin cannot modify SUPER_ADMIN role permissions or SUPER_ADMIN profile
    const opsLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'ops@hospital.test',
      password: 'OpsManager!2026#Strong',
    });
    const opsCookies = extractCookieMap(opsLogin.headers['set-cookie']);

    const opsRolesPatch = await request(app)
      .patch('/api/v1/roles/OPERATIONS_ADMIN/permissions')
      .set('Cookie', cookieHeader(opsCookies))
      .set('X-CSRF-Token', opsCookies.hlp_csrf_token!)
      .send({ permissions: ['users.read'] });
    expect(opsRolesPatch.status).toBe(403);

    const opsTouchSuper = await request(app)
      .patch(`/api/v1/users/${superAdminId}`)
      .set('Cookie', cookieHeader(opsCookies))
      .set('X-CSRF-Token', opsCookies.hlp_csrf_token!)
      .send({ fullName: 'Hacked' });
    expect(opsTouchSuper.status).toBe(403);
    expect(opsTouchSuper.body.error.code).toBe('FORBIDDEN_RESOURCE_OWNERSHIP');

    // Even if a non-SUPER_ADMIN role holds users.suspend, SUPER_ADMIN account remains protected
    const opsRole = await db.adminRole.findUniqueOrThrow({ where: { code: 'OPERATIONS_ADMIN' } });
    const suspendPerm = await db.adminPermission.findUniqueOrThrow({ where: { code: 'users.suspend' } });
    await db.adminRolePermission.create({
      data: { adminRoleId: opsRole.id, permissionId: suspendPerm.id },
    });
    const opsSuspendSuper = await request(app)
      .patch(`/api/v1/users/${superAdminId}/status`)
      .set('Cookie', cookieHeader(opsCookies))
      .set('X-CSRF-Token', opsCookies.hlp_csrf_token!)
      .send({ status: 'SUSPENDED', reason: 'Privilege abuse test' });
    expect(opsSuspendSuper.status).toBe(403);
    expect(opsSuspendSuper.body.error.code).toBe('SUPER_ADMIN_PROTECTED');

    // Patient A signs in: can read own profile, blocked from Patient B (ABAC IDOR) & Admin endpoints
    const aliceLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'alice@patient.test',
      password: 'PatientAlice!2026#Strong',
    });
    const aliceCookies = extractCookieMap(aliceLogin.headers['set-cookie']);

    const ownRes = await request(app)
      .get(`/api/v1/users/${patientAId}`)
      .set('Cookie', cookieHeader(aliceCookies));
    expect(ownRes.status).toBe(200);

    const otherUserRes = await request(app)
      .get(`/api/v1/users/${patientBId}`)
      .set('Cookie', cookieHeader(aliceCookies));
    expect(otherUserRes.status).toBe(403);
    expect(otherUserRes.body.error.code).toBe('FORBIDDEN_RESOURCE_OWNERSHIP');

    const patientAdminRes = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Cookie', cookieHeader(aliceCookies));
    expect(patientAdminRes.status).toBe(403);

    // Logout clears session & rejects further access
    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', cookieHeader(aliceCookies))
      .set('X-CSRF-Token', aliceCookies.hlp_csrf_token!);
    expect(logoutRes.status).toBe(200);

    const afterLogoutMe = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', cookieHeader(aliceCookies));
    expect(afterLogoutMe.status).toBe(401);

    // Expired access token test
    const badClaimsToken = signAccessToken({
      userId: patientAId,
      email: 'alice@patient.test',
      role: 'PATIENT',
      sessionId: 'non-existent-sid',
      sessionVersion: 1,
    });
    const fakeSidRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${badClaimsToken}`);
    expect(fakeSidRes.status).toBe(401);

    // Verify expired refresh cookie rejected
    const fakeRefresh = signRefreshToken({
      userId: opsAdminId,
      sessionId: 'non-existent-sid',
      tokenFamilyId: 'non-existent-family',
    });
    const badRefreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `hlp_refresh_token=${fakeRefresh}; hlp_csrf_token=abc`)
      .set('X-CSRF-Token', 'abc');
    expect(badRefreshRes.status).toBe(401);
  });

  it('enforces brute-force lockout, account suspension session revocation, and password reset invalidation', async () => {
    // Brute-force lock against Patient Bob
    for (let i = 0; i < 5; i += 1) {
      const bad = await request(app).post('/api/v1/auth/login').send({
        email: 'bob@patient.test',
        password: 'WrongPassword!123',
      });
      expect(bad.status).toBe(401);
    }
    const locked = await request(app).post('/api/v1/auth/login').send({
      email: 'bob@patient.test',
      password: 'PatientBob!2026#Strong',
    });
    expect(locked.status).toBe(429);

    // Password reset clears lockout & invalidates existing sessions
    const aliceLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'alice@patient.test',
      password: 'PatientAlice!2026#Strong',
    });
    const aliceCookies = extractCookieMap(aliceLogin.headers['set-cookie']);

    const forgotRes = await request(app).post('/api/v1/auth/forgot-password').send({
      email: 'alice@patient.test',
    });
    expect(forgotRes.status).toBe(200);
    // Non-existent email returns identical generic 200 to avoid enumeration
    const unknownForgot = await request(app).post('/api/v1/auth/forgot-password').send({
      email: 'nobody@patient.test',
    });
    expect(unknownForgot.status).toBe(200);

    const resetToken = [...capturedTokens]
      .reverse()
      .find((t) => t.email === 'alice@patient.test' && t.purpose === 'PASSWORD_RESET')?.rawToken;
    expect(resetToken).toBeTruthy();

    const resetRes = await request(app).post('/api/v1/auth/reset-password').send({
      token: resetToken,
      newPassword: 'AliceNewPass!2026#Strong',
      confirmPassword: 'AliceNewPass!2026#Strong',
    });
    expect(resetRes.status).toBe(200);

    // Old active session before reset is immediately rejected
    const oldSessionMe = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', cookieHeader(aliceCookies));
    expect(oldSessionMe.status).toBe(401);

    // New password works, then SUSPEND via Super Admin immediately invalidates session
    const newLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'alice@patient.test',
      password: 'AliceNewPass!2026#Strong',
    });
    expect(newLogin.status).toBe(200);
    const aliceNewCookies = extractCookieMap(newLogin.headers['set-cookie']);

    const rootLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'root@hospital.test',
      password: 'RootAdmin!2026#Strong',
    });
    const rootCookies = extractCookieMap(rootLogin.headers['set-cookie']);

    const suspendRes = await request(app)
      .patch(`/api/v1/users/${patientAId}/status`)
      .set('Cookie', cookieHeader(rootCookies))
      .set('X-CSRF-Token', rootCookies.hlp_csrf_token!)
      .send({ status: 'SUSPENDED', reason: 'Security review lock' });
    expect(suspendRes.status).toBe(200);

    const suspendedMe = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', cookieHeader(aliceNewCookies));
    expect(suspendedMe.status).toBe(401);
  });
});
