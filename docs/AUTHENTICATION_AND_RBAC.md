# Authentication & Role-Based Access Control (Step 3)

> **Stack:** Next.js 15 App Router, Auth.js v5 (`next-auth`), `@auth/prisma-adapter`, Prisma ORM (SQLite), Argon2id (`hash-wasm`), Zod  
> **Seed Policy:** Zero dummy accounts. Initial `SUPER_ADMIN` is created only via the explicit, one-time, environment-protected bootstrap command.

---

## 1. Authentication Architecture

### 1.1 Auth.js + Prisma Integration (`src/lib/auth/auth.ts`, `auth.config.ts`)
- **Adapter & Session Strategy:** Configured with `PrismaAdapter(prisma)` and encrypted HTTP-only JWT cookies (`strategy: 'jwt'`, `maxAge: 8 hours`) paired with tracked SQLite `Session` records (`sessionToken` + `User.sessionVersion`).
- **Immediate Revocation:** On logout (`/api/auth/logout` or `signOut` event), password reset, or account suspension/rejection/deactivation:
  1. All `Session` rows for `userId` are deleted in SQLite.
  2. `User.sessionVersion` is incremented atomically.
  3. Subsequent `jwt()` callbacks and server-side `requireAuthentication()` calls reject the token immediately.
- **Cookie Hardening:** `httpOnly: true`, `sameSite: 'lax'`, `path: '/'`, and `secure: true` in production (`__Secure-healthcare.session-token`).

### 1.2 Password Hashing (`src/lib/auth/password.ts`)
- **Algorithm:** RFC-9106 **Argon2id** (`hash-wasm`), memory `65536 KiB` (64 MiB), iterations `3`, parallelism `1`, `32`-byte hash output, `16`-byte cryptographically random salt.
- **Policy:** Minimum 12 characters containing uppercase, lowercase, numeric digit, and special character. Plaintext passwords are never stored or logged.

### 1.3 Rate Limiting & Brute-Force Protection (`src/lib/auth/rate-limit.ts`)
- Persistent SQLite tracking in `AuthRateLimit` (keyed by scope + SHA-256 hashed identifier).
- **Login & Password Reset Policy:** Maximum 5 attempts per 15-minute window; exceeding threshold locks the identifier for 15 minutes and emits an `AUTH_RATE_LIMIT_LOCKED` audit record.

---

## 2. Role Hierarchy & Permission Engine (`src/lib/auth/permissions.ts`, `rbac.ts`)

### 2.1 Roles
- **Administrative:** `SUPER_ADMIN`, `OPERATIONS_ADMIN`, `FINANCE_ADMIN`, `SUPPORT_ADMIN`
- **External:** `PATIENT`, `DOCTOR`, `HOSPITAL`

### 2.2 Permission Matrix
- Granular permissions (`users.read`, `users.update`, `users.suspend`, `patients.read`, `patients.update`, `doctors.read`, `doctors.verify`, `doctors.update`, `hospitals.read`, `hospitals.verify`, `hospitals.update`, `leads.read`, `leads.qualify`, `leads.assign`, `leads.reject`, `subscriptions.read`, `subscriptions.manage`, `payments.read`, `payments.refund`, `analytics.read`, `support.manage`, `audit_logs.read`, `settings.manage`) are persisted in `AdminPermission` and mapped via `AdminRolePermission`.
- Server-side enforcement helpers:
  - `requireAuthentication()` — validates Auth.js session, `accountStatus === 'ACTIVE'`, `emailVerified !== null`, `deletedAt === null`, `sessionVersion`, live `Session` row, and active `AdminRole`.
  - `requireRole(allowedRoles)` — verifies role membership and logs denied attempts to `AuditLog`.
  - `requirePermission(permissionCode)` — queries `AdminRolePermission` directly in SQLite.
  - `requireSelfOrPermission(ownerUserId, permissionCode)` — enforces anti-IDOR resource ownership.

---

## 3. Registration, Verification & Password Reset Flows

- **Patient (`/register/patient` → `POST /api/auth/register/patient`):** Requires full name, email, phone, strong password, and terms acceptance. Starts `PENDING_VERIFICATION`; activates to `ACTIVE` upon email verification.
- **Doctor (`/register/doctor` → `POST /api/auth/register/doctor`):** Captures medical registration number, licensing authority, country, primary specialization, and location. Email verification confirms address only; account remains `PENDING_VERIFICATION` until approved by an authorized administrator (`doctors.verify`).
- **Hospital (`/register/hospital` → `POST /api/auth/register/hospital`):** Captures facility registration number, accreditation, and address. Remains `PENDING_VERIFICATION` until approved by an authorized administrator (`hospitals.verify`).
- **Opaque Tokens (`AuthToken`):** Email verification (24h expiry) and password reset (30m expiry) store **only SHA-256 hashes** (`tokenHash`) of 32-byte random tokens.

---

## 4. Protected Route Architecture

- **Early Edge Protection (`src/middleware.ts`):** Guards `/admin/*`, `/patient/*`, `/doctor/*`, and `/hospital/*` using Edge-safe `authConfig` without bundling Prisma in Edge Runtime. Unauthenticated users redirect to `/login`; unauthorized roles redirect to `/access-denied`.
- **Authoritative Server Enforcement:** Every protected page (`ProtectedWorkspaceShell`) and API route calls `requireAuthentication()`, `requireRole()`, or `requirePermission()` against SQLite so middleware bypass or stale cookies never grant access.

---

## 5. One-Time Super Admin Bootstrap

```bash
cd frontend
# Set BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD, BOOTSTRAP_ADMIN_NAME in .env or environment
npm run admin:bootstrap
```

- Idempotently populates `AdminRole`, `AdminPermission`, and `AdminRolePermission`.
- Creates the initial `SUPER_ADMIN` user (`ACTIVE`, `emailVerified` set).
- **Fails safely (`409 ADMIN_ALREADY_EXISTS`)** if any administrator account already exists.
