import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { parseBackendEnv, type BackendEnv } from '../src/config/env.js';
import type { ResolvedAuthIdentity } from '../src/middleware/auth.js';
import { sanitizeAuditMetadata } from '../src/services/audit.service.js';

const VALID_TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '4100',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
  SUPABASE_URL: 'https://example-project.supabase.co',
  SUPABASE_ANON_KEY: 'anon-placeholder-key-long-enough-for-zod',
  SUPABASE_SERVICE_ROLE_KEY: 'service-placeholder-key-long-enough-for-zod',
};

describe('Backend Environment Configuration', () => {
  it('parses valid environment variables', () => {
    const parsed = parseBackendEnv(VALID_TEST_ENV);
    assert.equal(parsed.NODE_ENV, 'test');
    assert.equal(parsed.PORT, 4100);
    assert.deepEqual(parsed.CORS_ALLOWED_ORIGINS, ['http://localhost:3000']);
  });

  it('rejects identical anon and service-role keys', () => {
    assert.throws(
      () =>
        parseBackendEnv({
          ...VALID_TEST_ENV,
          SUPABASE_SERVICE_ROLE_KEY: VALID_TEST_ENV.SUPABASE_ANON_KEY,
        }),
      /must be distinct/,
    );
  });

  it('rejects missing SUPABASE_URL', () => {
    const { SUPABASE_URL: _omitted, ...incomplete } = VALID_TEST_ENV;
    assert.throws(() => parseBackendEnv(incomplete), /Invalid backend environment configuration/);
  });
});

describe('Audit Metadata Sanitizer', () => {
  it('redacts sensitive credential, card, and PHI fields recursively', () => {
    const clean = sanitizeAuditMetadata({
      actionType: 'lead_viewed',
      nested: {
        chief_complaint_summary: 'sensitive symptom text',
        cardNumber: '4111',
        token: 'secret-jwt',
        safeCount: 2,
      },
    }) as Record<string, unknown>;

    const nested = clean.nested as Record<string, unknown>;
    assert.equal(clean.actionType, 'lead_viewed');
    assert.equal(nested.chief_complaint_summary, '[REDACTED]');
    assert.equal(nested.cardNumber, '[REDACTED]');
    assert.equal(nested.token, '[REDACTED]');
    assert.equal(nested.safeCount, 2);
  });
});

describe('HTTP Foundation, Auth & RBAC Boundaries', () => {
  let server: http.Server;
  let baseUrl = '';
  const parsedEnv: BackendEnv = parseBackendEnv(VALID_TEST_ENV);

  const identitiesByToken: Record<string, ResolvedAuthIdentity> = {
    'token-super-admin': {
      userId: '00000000-0000-4000-8000-000000000001',
      email: 'super@example.test',
      role: 'super_admin',
      accountStatus: 'active',
      adminScope: 'super_admin',
    },
    'token-finance-admin': {
      userId: '00000000-0000-4000-8000-000000000002',
      email: 'finance@example.test',
      role: 'finance_admin',
      accountStatus: 'active',
      adminScope: 'finance_admin',
    },
    'token-revoked-ops-admin': {
      userId: '00000000-0000-4000-8000-000000000003',
      email: 'ops@example.test',
      role: 'operations_admin',
      accountStatus: 'active',
      adminScope: null,
    },
    'token-suspended-patient': {
      userId: '00000000-0000-4000-8000-000000000004',
      email: 'patient@example.test',
      role: 'patient',
      accountStatus: 'suspended',
      adminScope: null,
    },
    'token-patient': {
      userId: '00000000-0000-4000-8000-000000000005',
      email: 'active-patient@example.test',
      role: 'patient',
      accountStatus: 'active',
      adminScope: null,
    },
  };

  before(async () => {
    const app = createApp({
      env: parsedEnv,
      authResolver: async (token) => identitiesByToken[token] ?? null,
    });
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to bind ephemeral test port');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('serves /health without exposing secrets', async () => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      success: boolean;
      data: { status: string; phase: string };
    };
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'ok');
    assert.equal(body.data.phase, 'foundation');
    assert.ok(response.headers.get('x-request-id'));
  });

  it('rejects unauthenticated requests to protected module routes with 401', async () => {
    const response = await fetch(`${baseUrl}/api/v1/leads/me`);
    assert.equal(response.status, 401);
    const body = (await response.json()) as { success: boolean; error: { code: string } };
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'UNAUTHORIZED');
  });

  it('rejects suspended accounts with 403 ACCOUNT_INACTIVE', async () => {
    const response = await fetch(`${baseUrl}/api/v1/leads/me`, {
      headers: { Authorization: 'Bearer token-suspended-patient' },
    });
    assert.equal(response.status, 403);
    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'ACCOUNT_INACTIVE');
  });

  it('rejects admins whose admin_roles scope is missing or revoked', async () => {
    const response = await fetch(`${baseUrl}/api/v1/leads/123/qualify`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token-revoked-ops-admin' },
    });
    assert.equal(response.status, 403);
    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'FORBIDDEN_ROLE');
  });

  it('blocks finance_admin from accessing clinical lead endpoints (SoD)', async () => {
    const response = await fetch(`${baseUrl}/api/v1/leads/123`, {
      headers: { Authorization: 'Bearer token-finance-admin' },
    });
    assert.equal(response.status, 403);
    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'FORBIDDEN_ROLE');
  });

  it('allows authorized roles past RBAC guard to reserved 501 module boundary', async () => {
    const response = await fetch(`${baseUrl}/api/v1/consents`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token-patient' },
    });
    assert.equal(response.status, 501);
    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'NOT_IMPLEMENTED');
  });

  it('allows super_admin to reach audit boundary (501) and blocks patient (403)', async () => {
    const denied = await fetch(`${baseUrl}/api/v1/audit/logs`, {
      headers: { Authorization: 'Bearer token-patient' },
    });
    assert.equal(denied.status, 403);

    const allowed = await fetch(`${baseUrl}/api/v1/audit/logs`, {
      headers: { Authorization: 'Bearer token-super-admin' },
    });
    assert.equal(allowed.status, 501);
  });
});
