# REST API Architecture & Module Boundaries

> **Base Path:** `/api/v1` (plus `/health` liveness probe)  
> **Implementation Status:** Phase 1 implements the Express application bootstrap, Zod environment validation, auth/RBAC middleware foundations, error handler, `/health` probe, and typed module router boundaries (`501 NOT_IMPLEMENTED` placeholders for domain endpoints until Phase 2+).

## 1. REST API Design Conventions

### 1.1 Standard Response Envelopes

**Success (`2xx`)**
```json
{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "uuid",
    "timestamp": "2026-11-10T16:15:00.000Z"
  }
}
```

**Paginated Collection**
```json
{
  "success": true,
  "data": [],
  "meta": {
    "requestId": "uuid",
    "pagination": {
      "limit": 20,
      "nextCursor": "opaque-cursor-or-null",
      "hasMore": false
    }
  }
}
```

**Error (`4xx` / `5xx`)**
```json
{
  "success": false,
  "error": {
    "code": "CONSENT_REQUIRED",
    "message": "Explicit provider_disclosure consent is required before accessing or sharing this enquiry.",
    "requestId": "uuid",
    "details": {}
  }
}
```

### 1.2 Standard Security & Reliability Headers
- `Authorization: Bearer <supabase-access-jwt>` (required on all endpoints except `/health`, public catalog read endpoints, and signature-verified payment webhooks).
- `X-Request-Id`: Accepted or generated per request and propagated to logs and `audit_logs.request_id`.
- `Idempotency-Key`: Mandatory on lead creation, consent grants, assignment responses, and payment initiation.
- `Content-Type: application/json` (strict payload size limits via `express.json({ limit: '256kb' })`).

### 1.3 Canonical Error Codes

| HTTP Status | Error Code | Meaning |
| :---: | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Zod schema validation failed on body, query, or params |
| `401` | `UNAUTHORIZED` | Missing, malformed, expired, or invalid Supabase JWT |
| `403` | `FORBIDDEN_ROLE` | Authenticated user lacks required role or active `admin_roles` scope |
| `403` | `ACCOUNT_INACTIVE` | User `account_status` is `suspended`, `deactivated`, or `pending_verification` |
| `403` | `CONSENT_REQUIRED` | Active, unwithdrawn patient consent is missing for PHI operation |
| `404` | `RESOURCE_NOT_FOUND` | Requested entity does not exist or is invisible to caller's tenant scope |
| `409` | `STATE_CONFLICT` | Invalid lead/assignment state transition or idempotency conflict |
| `422` | `PROVIDER_INELIGIBLE` | Provider unverified, license expired, inactive quota, or not accepting leads |
| `429` | `RATE_LIMITED` | Rate limit exceeded |
| `501` | `NOT_IMPLEMENTED` | Route boundary reserved in Phase 1; implementation scheduled in Phase 2+ |

---

## 2. Backend Module Boundaries (`backend/src/modules/`)

The backend follows a **modular monolith** layout with unidirectional service dependencies:

```
routes (HTTP/Zod/RBAC) -> service (Business Logic + Transactions) -> repository / Supabase Client -> PostgreSQL
```

| Module | Directory | Owned Tables | Allowed Dependencies | Prohibited |
| :--- | :--- | :--- | :--- | :--- |
| **`health`** | `modules/health` | None | Config/env only | Returning secrets or stack traces |
| **`auth`** | `modules/auth` | `users` (sync/read) | `audit` | Accepting client-supplied role headers |
| **`users`** | `modules/users` | `users`, `admin_roles` | `audit`, `notifications` | Directly mutating billing or clinical records |
| **`patients`** | `modules/patients` | `patients` | `users`, `audit` | Exposing patient rows to provider roles |
| **`providers`** | `modules/providers` | `doctors`, `doctor_specializations`, `hospitals`, `hospital_departments`, `specializations` | `users`, `audit`, `notifications` | Allowing self-verification |
| **`consents`** | `modules/consents` | `consent_policies`, `patient_consents` | `patients`, `audit`, `notifications` | Deleting consent records |
| **`leads`** | `modules/leads` | `leads`, `lead_history` | `patients`, `consents`, `providers`, `audit`, `notifications` | Releasing PHI without active consent |
| **`matching`** | `modules/matching` | `lead_assignments` | `leads`, `providers`, `consents`, `billing` (quota check), `notifications`, `audit` | Assigning unverified or zero-quota providers |
| **`billing`** | `modules/billing` | `subscription_plans`, `subscriptions`, `invoices`, `payments` | `providers`, `audit`, `notifications` | Storing raw card numbers/CVVs; accessing clinical PHI |
| **`notifications`** | `modules/notifications` | `notifications` | `users` | Embedding PHI in email/SMS subjects or push payloads |
| **`support`** | `modules/support` | `support_tickets`, `support_ticket_messages` | `users`, `audit`, `notifications` | Exposing `is_internal_note = true` to non-admins |
| **`audit`** | `modules/audit` | `audit_logs` | Service-role Supabase client only | Any `UPDATE` or `DELETE` method |

---

## 3. Target REST Endpoint Catalog (Phase 2+ Contract)

> **Note:** Phase 1 registers module routers under `/api/v1/*` and activates `GET /health`. Domain endpoints below represent the architectural API contract to be implemented incrementally starting Phase 2.

### Health & Auth
- `GET /health` — Public liveness check (`status`, `service`, `timestamp`, `environment`). *(Active in Phase 1)*
- `GET /api/v1/auth/me` — Returns verified caller profile, `primary_role`, `account_status`, and active `admin_scope`.
- `POST /api/v1/auth/onboarding` — Completes role-specific initial profile (`patient`, `doctor`, or `hospital`) after Supabase signup.

### Users & Admin Governance (`users`)
- `GET /api/v1/admin/users` — `[super_admin, operations_admin, support_admin]` Paginated user search (role-filtered DTO).
- `POST /api/v1/admin/roles` — `[super_admin]` Grant an `admin_roles` assignment (audited).
- `POST /api/v1/admin/roles/:id/revoke` — `[super_admin]` Revoke admin role immediately (audited).
- `PATCH /api/v1/admin/users/:id/status` — `[super_admin]` Suspend or reactivate user account (audited).

### Patients (`patients`)
- `GET /api/v1/patients/me` — `[patient]` Retrieve own patient profile.
- `PATCH /api/v1/patients/me` — `[patient]` Update own demographics/location.

### Providers & Specializations (`providers`)
- `GET /api/v1/specializations` — `[authenticated]` List active clinical specializations.
- `POST /api/v1/specializations` — `[super_admin, operations_admin]` Create specialization.
- `GET /api/v1/providers/directory` — `[authenticated]` Search verified doctors & hospitals.
- `GET/PUT /api/v1/doctors/me` — `[doctor]` Manage own doctor profile & `doctor_specializations`.
- `GET/PUT /api/v1/hospitals/me` — `[hospital]` Manage own hospital profile & `hospital_departments`.
- `POST /api/v1/admin/providers/:type/:id/verify` — `[operations_admin, super_admin]` Approve or reject KYC/license verification (audited).

### Consents (`consents`)
- `GET /api/v1/consent-policies/active` — `[authenticated]` Fetch current active consent policy versions.
- `POST /api/v1/consent-policies` — `[super_admin]` Publish new policy version.
- `GET /api/v1/consents/me` — `[patient]` List own consent records.
- `POST /api/v1/consents` — `[patient]` Grant explicit consent (`platform_triage` / `provider_disclosure`).
- `POST /api/v1/consents/:id/withdraw` — `[patient]` Withdraw consent and cascade-revoke open disclosures (audited).

### Leads & Matching (`leads`, `matching`)
- `POST /api/v1/leads` — `[patient]` Create healthcare enquiry (`Idempotency-Key` required).
- `GET /api/v1/leads/me` — `[patient]` List own enquiries and current matched provider statuses.
- `GET /api/v1/leads/:id` — `[patient (own), operations_admin, super_admin, assigned provider (consent-gated)]` Retrieve enquiry using role-appropriate projection (masked before acceptance; consented PHI after acceptance + audited).
- `POST /api/v1/leads/:id/qualify` — `[operations_admin, super_admin]` Qualify or reject submitted lead.
- `POST /api/v1/leads/:id/match` — `[operations_admin, super_admin, system]` Execute matching algorithm & dispatch assignments.
- `GET /api/v1/assignments/me` — `[doctor, hospital]` List assigned lead offers & active engagements.
- `POST /api/v1/assignments/:id/respond` — `[doctor, hospital]` Accept or decline pending assignment (updates quota atomically on accept).

### Billing (`billing`)
- `GET /api/v1/billing/plans` — `[authenticated]` View active `subscription_plans`.
- `POST /api/v1/admin/billing/plans` — `[finance_admin, super_admin]` Create/update subscription plans.
- `POST /api/v1/billing/subscriptions/checkout` — `[doctor, hospital]` Initiate gateway checkout session.
- `GET /api/v1/billing/subscriptions/me` — `[doctor, hospital]` View own subscription, period quota, invoices, and payments.
- `GET /api/v1/admin/billing/invoices` — `[finance_admin, super_admin]` Reconcile invoices & payments.
- `POST /api/v1/webhooks/payments/:provider` — `[public + HMAC signature verified]` Idempotent payment/subscription event ingestion.

### Notifications, Support & Audit (`notifications`, `support`, `audit`)
- `GET /api/v1/notifications/me` — `[authenticated]` Fetch user notifications.
- `PATCH /api/v1/notifications/:id/read` — `[authenticated]` Mark notification read.
- `POST /api/v1/support/tickets` — `[authenticated]` Open support ticket.
- `GET /api/v1/support/tickets` — `[authenticated (own), support_admin, operations_admin, super_admin]` List tickets.
- `POST /api/v1/support/tickets/:id/messages` — `[participant, support_admin, super_admin]` Reply (`is_internal_note` restricted to admins).
- `GET /api/v1/admin/audit-logs` — `[super_admin]` Query immutable compliance audit logs.
