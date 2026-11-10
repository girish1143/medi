import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { ROLE_HOME_ROUTES } from '../src/lib/auth/roles';
import { PERMISSIONS } from '../src/lib/auth/permissions';

describe('Frontend Decoupled Boundary Verification (Zero Prisma / Direct DB)', () => {
  it('contains zero Prisma schema files or @prisma/client imports in frontend/', () => {
    const prismaDir = path.resolve(process.cwd(), 'prisma');
    assert.equal(fs.existsSync(prismaDir), false, 'frontend/prisma must not exist after moving Prisma to backend');

    const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    assert.equal(pkg.dependencies?.['@prisma/client'], undefined);
    assert.equal(pkg.devDependencies?.prisma, undefined);
    assert.equal(pkg.dependencies?.['next-auth'], undefined);
  });

  it('defines role route homes and canonical RBAC permission keys for UI navigation', () => {
    assert.equal(ROLE_HOME_ROUTES.SUPER_ADMIN, '/admin');
    assert.equal(ROLE_HOME_ROUTES.PATIENT, '/patient');
    assert.equal(ROLE_HOME_ROUTES.DOCTOR, '/doctor');
    assert.equal(ROLE_HOME_ROUTES.HOSPITAL, '/hospital');
    assert.equal(PERMISSIONS.LEADS_ASSIGN, 'leads.assign');
    assert.equal(PERMISSIONS.PAYMENTS_REFUND, 'payments.refund');
  });
});
