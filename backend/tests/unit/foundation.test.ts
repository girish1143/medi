import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import {
  connectDatabase,
  createPrismaClient,
  disconnectDatabase,
} from '../../src/config/database';
import { loadEnv, resetEnvCache } from '../../src/config/env';
import { LOGGER_REDACT_PATHS } from '../../src/config/logger';

describe('Phase 1 Backend Foundation (Express, Security Headers, CORS, Env, SQLite Health)', () => {
  let tempDir: string;
  let testDbPath: string;

  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.FRONTEND_ORIGIN = 'http://localhost:3000';
    process.env.JWT_ACCESS_SECRET = 'test-access-secret-minimum-32-chars-abcdef123456';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-minimum-32-chars-654321fedcba';
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backend-phase1-'));
    testDbPath = path.join(tempDir, 'foundation.db');
    process.env.DATABASE_URL = `file:${testDbPath}`;
    resetEnvCache();
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    resetEnvCache();
  });

  it('validates backend environment variables strictly and rejects weak JWT secrets', () => {
    expect(() =>
      loadEnv({
        NODE_ENV: 'test',
        JWT_ACCESS_SECRET: 'short',
        JWT_REFRESH_SECRET: 'test-refresh-secret-minimum-32-chars-654321fedcba',
      }),
    ).toThrow(/JWT_ACCESS_SECRET/);

    const valid = loadEnv(process.env);
    expect(valid.PORT).toBe(4000);
    expect(valid.FRONTEND_ORIGIN).toBe('http://localhost:3000');
  });

  it('serves /api/v1/health with live SQLite connection and security headers without leaking DB paths', async () => {
    const db = createPrismaClient(`file:${testDbPath}`);
    await connectDatabase(db);
    const app = createApp({ db });

    try {
      const res = await request(app).get('/api/v1/health').set('Origin', 'http://localhost:3000');

      expect(res.status).toBe(200);
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-request-id']).toBeTruthy();
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(res.body.success).toBe(true);
      expect(res.body.data.database).toBe('connected');
      expect(JSON.stringify(res.body)).not.toContain('foundation.db');
    } finally {
      await disconnectDatabase(db);
    }
  });

  it('rejects disallowed CORS origins and returns standardized 404 envelopes', async () => {
    const db = createPrismaClient(`file:${testDbPath}`);
    const app = createApp({ db });

    try {
      const corsRejected = await request(app)
        .get('/api/v1/health')
        .set('Origin', 'https://evil.example.com');
      expect(corsRejected.status).toBe(403);
      expect(corsRejected.body.success).toBe(false);
      expect(corsRejected.body.error.code).toBe('CORS_FORBIDDEN');

      const notFound = await request(app).get('/api/v1/does-not-exist');
      expect(notFound.status).toBe(404);
      expect(notFound.body.success).toBe(false);
      expect(notFound.body.error.code).toBe('ROUTE_NOT_FOUND');
    } finally {
      await disconnectDatabase(db);
    }
  });

  it('configures Pino redaction paths for credentials, tokens, cards, and enquiry text', () => {
    expect(LOGGER_REDACT_PATHS).toContain('*.password');
    expect(LOGGER_REDACT_PATHS).toContain('*.passwordHash');
    expect(LOGGER_REDACT_PATHS).toContain('*.refreshToken');
    expect(LOGGER_REDACT_PATHS).toContain('*.enquiryDescription');
  });
});
