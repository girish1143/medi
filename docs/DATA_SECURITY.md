# Data Security & Privacy Architecture

> **Scope:** Credential handling, RBAC enforcement, patient consent gating, payment security, and auditability across `frontend/prisma/` and `frontend/src/lib/`.

## 1. Server-Only Database Boundary

- **Prisma Client Isolation (`frontend/src/lib/db/prisma.ts`):**
  - Fails fast if imported in a browser context (`typeof window !== 'undefined'`).
  - Reads `DATABASE_URL` exclusively via `getServerEnv()` (`frontend/src/lib/env.ts`), never from `NEXT_PUBLIC_*` variables.
  - Client components and browser bundles never receive SQLite file paths or direct database credentials.

## 2. Password & Session Security

- **Password Hashing (`frontend/src/lib/auth/password.ts`):**
  - Uses `bcryptjs` with work factor `12` (`BCRYPT_ROUNDS = 12`) and enforces minimum 12-character passwords on hash generation.
  - Plaintext passwords are never stored, logged, or returned in DTOs (`passwordHash` is omitted from all non-auth queries and explicitly excluded from session tokens).
- **Auth.js Session Management (`frontend/src/lib/auth/auth.ts`):**
  - Validates sign-in inputs with Zod (`email` normalized lowercase).
  - Rejects deleted (`deletedAt !== null`) or non-`ACTIVE` accounts (`PENDING_VERIFICATION`, `SUSPENDED`, `DEACTIVATED`) and logs denied attempts to `AuditLog`.
  - Requires administrative sign-ins to match an active `AdminRole` (`isActive = true`, `code === user.role`).
  - Uses encrypted HTTP-only JWT session cookies (`maxAge: 8 hours`) signed with server-only `AUTH_SECRET`.

## 3. Server-Side RBAC Enforcement (`frontend/src/lib/auth/rbac.ts`)

Every protected server action or Route Handler must call `requireAuthenticatedActor()`, `requireRole(...)`, or `requireAdminPermission(...)`:
- Re-queries `User` and `AdminRole` / `AdminRolePermission` directly in SQLite on each privileged operation so suspended users or revoked admin permissions take effect immediately rather than waiting for JWT expiry.
- Denied checks automatically emit `outcome = 'DENIED'` records to `AuditLog`.

## 4. Patient Consent Gate & Progressive PHI Minimization

- **Minimal Lead Intake:** `Lead.enquiryDescription` stores only high-level routing context (avoiding excessive clinical records inside lead generation tables).
- **Explicit Consent Verification (`frontend/src/lib/services/consent.service.ts`):**
  - `verifyValidLeadConsentForProvider()` checks `PatientConsent` for:
    1. Matching `leadId` and `consentPurpose = 'PROVIDER_CONTACT_DISCLOSURE'`
    2. `status = 'GRANTED'` and `revokedAt IS NULL`
    3. Unexpired (`expiresAt IS NULL OR expiresAt > NOW()`)
    4. Authorized provider scope (`SPECIFIC_DOCTOR`, `SPECIFIC_HOSPITAL`, or `MATCHED_PROVIDERS` paired with an active `LeadAssignment`).
  - `getConsentedPatientContactForProvider()` additionally requires `LeadAssignment.status = 'ACCEPTED'` before projecting `fullName`, `email`, `phone`, and city/language to the provider.
  - Every successful disclosure or blocked attempt writes an `AuditLog` entry (`PATIENT_CONTACT_DISCLOSED_TO_PROVIDER` or `PATIENT_CONTACT_ACCESS_DENIED_*`).
- **Instant Consent Revocation:** `revokePatientLeadConsent()` sets `status = 'REVOKED'` and immediately revokes open `PENDING`/`ACCEPTED` `LeadAssignment` rows in the same database transaction.

## 5. Payment & Financial Security

- `Payment` records strictly store gateway identifiers (`gatewayProvider`, `gatewayPaymentId`, `gatewayCustomerId`), tokenized `paymentMethodType` (`CARD_TOKEN`, `UPI`, `ACH`, `WIRE`, `NETBANKING`, `OTHER`), `idempotencyKey`, and integer minor amounts.
- Raw credit/debit card numbers (PAN), CVV/CVC security codes, and card expiration dates are **never stored** in the database or logged in `AuditLog`.

## 6. Audit Logging & Redaction (`frontend/src/lib/services/audit.service.ts`)

- `sanitizeAuditMetadata()` recursively redacts sensitive keys (`password`, `passwordHash`, `token`, `secret`, `authorization`, `database_url`, `auth_secret`, `cardNumber`, `cvv`, `pan`, `enquiryDescription`) before persisting JSON to `AuditLog.metadataJson`.
