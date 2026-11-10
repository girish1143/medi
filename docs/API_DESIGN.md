# Next.js API Routes & Module Architecture

> **Base Path:** `/api` (Next.js App Router Route Handlers inside `frontend/src/app/api/`)  
> **Database:** SQLite (`file:./dev.db`) via Prisma ORM

## 1. API Design Conventions

### Standard Response Envelopes

**Success (`2xx`)**
```json
{
  "success": true,
  "data": {}
}
```

**Error (`4xx` / `5xx`)**
```json
{
  "success": false,
  "error": {
    "code": "CONSENT_REQUIRED",
    "message": "Active patient consent is missing or revoked for this lead."
  }
}
```

### Security & Validation Standards
- Every mutating endpoint enforces same-origin verification (`enforceSameOrigin`) and Zod schema validation (`src/lib/validation/`).
- Protected endpoints validate the encrypted HTTP-only Auth.js session cookie AND live SQLite user/session/permission status (`requireAuthentication`, `requireRole`, `requirePermission`, `requireSelfOrPermission`).
- All database access is encapsulated inside `src/repositories/` and `src/services/` (never exposed to browser components).

---

## 2. Implemented API Endpoints

### Health & Authentication
- `GET /api/health` — SQLite database connectivity verification (`SELECT 1 AS ok`)
- `* /api/auth/[...nextauth]` — Auth.js v5 session & credentials endpoints
- `POST /api/auth/register/patient` — Patient registration (Zod + Argon2id + email verification token)
- `POST /api/auth/register/doctor` — Doctor registration (pending email & admin verification)
- `POST /api/auth/register/hospital` — Hospital registration (pending email & admin verification)
- `POST /api/auth/verify-email` — Consume single-use SHA-256 verification token
- `POST /api/auth/forgot-password` — Rate-limited password reset token request
- `POST /api/auth/reset-password` — Argon2id password update + immediate session revocation
- `POST /api/auth/logout` — Revoke DB session + Auth.js sign-out
- `GET /api/auth/me` — Verified current user profile

### Patients, Doctors & Hospitals
- `GET / PATCH /api/patients/me` — Authenticated patient self-profile management (`PATIENT`)
- `GET /api/patient/profile` — Authenticated patient summary (`PATIENT`)
- `GET /api/patients` — Authorized patient directory (`patients.read`)
- `GET /api/doctors` — Verified doctor directory (public/authenticated) or full view (`doctors.read`)
- `GET / PATCH /api/doctors/me` — Authenticated doctor profile management (`DOCTOR`)
- `GET /api/hospitals` — Verified hospital directory or full view (`hospitals.read`)
- `GET / PATCH /api/hospitals/me` — Authenticated hospital profile management (`HOSPITAL`)

### Leads, Consents, Contact Requests & Appointments
- `GET / POST /api/leads` — Patient enquiry submission & role-scoped listing
- `GET / PATCH /api/leads/[id]` — Role-scoped lead detail & status transitions (qualify/reject/close)
- `POST /api/leads/[id]/assign` — Transactional lead assignment to verified provider (`leads.assign`)
- `POST /api/leads/assignments/[id]/respond` — Doctor/Hospital acceptance or rejection of lead offer
- `GET / POST /api/consents` — Patient consent listing & explicit consent grant
- `POST /api/consents/[id]/revoke` — Patient consent withdrawal + cascade assignment revocation
- `GET / POST /api/contact-requests` — Consent-governed contact request creation & listing
- `GET / POST /api/appointments` — Appointment scheduling & role-scoped listing
- `PATCH /api/appointments/[id]` — Appointment confirmation, completion, or cancellation

### Administration, Analytics, Billing, Support & Audit Logs
- `GET /api/admin/dashboard` — Real-time SQLite aggregate counts & Recharts time-series (`analytics.read`)
- `GET /api/admin/analytics` — Date-filtered operational analytics (`analytics.read`)
- `GET /api/admin/analytics/export` — Audited, CSV-formula-safe report downloads (`analytics.read`)
- `GET / POST /api/admin/users` — User search/filtering/pagination (`users.read`) & admin provisioning (`SUPER_ADMIN`)
- `GET /api/admin/users/[id]` — Full user account profile & history (`users.read`)
- `PATCH /api/admin/users/[id]/status` — Suspend/reactivate accounts + revoke active sessions (`users.suspend`)
- `GET /api/admin/doctors` — Doctor listing with search/verification filter & pagination (`doctors.read`)
- `POST /api/admin/doctors/[id]/specializations` — Manage doctor specializations (`doctors.update`)
- `GET /api/admin/hospitals` — Hospital listing with search/verification filter & pagination (`hospitals.read`)
- `POST / PATCH /api/admin/hospitals/[id]/departments` — Manage hospital departments (`hospitals.update`)
- `POST /api/admin/providers/verify` — Approve/reject Doctor or Hospital credentials (`doctors.verify` / `hospitals.verify`)
- `PATCH /api/admin/providers/documents/[id]/review` — Review uploaded credential documents (`doctors.verify` / `hospitals.verify`)
- `GET /api/admin/leads` — Filterable Lead CRM directory (`leads.read`)
- `GET /api/admin/leads/[id]/matches` — Specialization, location & subscription-quota provider matcher (`leads.read`)
- `POST /api/admin/leads/[id]/reassign` — Transactional assignment/reassignment (`leads.assign`)
- `POST /api/admin/leads/[id]/reveal-contact` — Consent-gated & audited patient contact reveal (`patients.read`)
- `GET / POST /api/admin/subscriptions` — Plan catalog + provider subscriptions (`subscriptions.read` / `subscriptions.manage`)
- `PATCH /api/admin/subscriptions/plans/[id]` — Update or toggle subscription plans (`subscriptions.manage`)
- `GET /api/admin/payments` — Tokenized payment & invoice ledger with date filters (`payments.read`)
- `POST /api/admin/payments/[id]/refund` — Audited partial or full refund reconciliation (`payments.refund`)
- `GET / PATCH / POST /api/admin/notifications` — Admin inbox mark-read & dispatch queue (`ADMIN_ROLE_CODES` / `settings.manage`)
- `GET /api/admin/support` — Filterable support ticket queue & admin assignees (`support.manage`)
- `GET / PATCH / POST /api/admin/support/[id]` — Ticket status, assignment & replies/internal notes (`support.manage`)
- `GET /api/admin/activity` — Operational activity monitoring (`analytics.read` / `audit_logs.read`)
- `GET /api/admin/audit-logs` — Filterable security audit log explorer with redacted metadata (`audit_logs.read`)
- `GET / PUT /api/admin/settings` — Persisted `PlatformSetting` management & RBAC role catalog (`settings.manage`)
