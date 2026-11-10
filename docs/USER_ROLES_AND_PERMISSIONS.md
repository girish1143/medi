# User Roles and Permissions

> **Scope:** Role taxonomy, Separation of Duties (SoD), dual-layer RBAC enforcement, and PostgreSQL RLS alignment across all 7 platform roles.

## 1. Platform Roles Overview

| Role Identifier (`app_role`) | Category | Purpose & Scope |
| :--- | :--- | :--- |
| **`super_admin`** | Internal Admin | Platform governance, admin role provisioning/revocation (`admin_roles`), consent policy versioning, system configuration, compliance/audit log inspection, break-glass incident intervention. |
| **`operations_admin`** | Internal Admin | Healthcare provider onboarding & credential KYC (`doctors`, `hospitals`, `hospital_departments`), specialization catalog curation, lead triage/qualification, manual lead assignment/reassignment, SLA escalation. |
| **`finance_admin`** | Internal Admin | Subscription plan management (`subscription_plans`), subscription status management, invoice reconciliation, payment & refund review (`invoices`, `payments`). **Explicitly isolated from patient clinical PHI.** |
| **`support_admin`** | Internal Admin | Support ticket management (`support_tickets`, `support_ticket_messages`), account troubleshooting, user assistance using minimal masked lead metadata. **Cannot grant roles, verify licenses, or issue billing refunds.** |
| **`patient`** | External User | Submits healthcare enquiries (`leads`), grants/withdraws explicit `patient_consents`, views own lead statuses and matched providers, opens support tickets, manages personal profile. |
| **`doctor`** | Healthcare Provider | Maintains professional profile, medical registration credentials, and specializations; subscribes to lead plans; reviews/accepts/declines assigned leads (subject to active patient consent). |
| **`hospital`** | Healthcare Provider | Maintains organization profile, accreditation metadata, and clinical `hospital_departments`; subscribes to lead plans; manages facility-assigned leads (subject to active patient consent). |

---

## 2. Separation of Duties (SoD) Principles

1. **Clinical Privacy vs Financial Administration:** `finance_admin` can manage plans, invoices, and payment statuses, but has **no read permission** on `patients`, `leads`, `patient_consents`, or clinical complaint summaries.
2. **Operational Triage vs Privilege Escalation:** `operations_admin` can verify doctors/hospitals and manually route leads, but cannot create or modify `admin_roles` or `users.primary_role`.
3. **Support Isolation:** `support_admin` handles user tickets and can post internal support notes (`is_internal_note = TRUE`), but cannot access bulk PHI exports, verify provider licenses, or alter billing ledgers.
4. **Provider Self-Verification Lock:** `doctor` and `hospital` accounts cannot set `verification_status = 'verified'` or enable `is_accepting_leads = TRUE` while unverified (enforced by `trg_guard_doctors_verification` and `trg_guard_hospitals_verification`).

---

## 3. Comprehensive RBAC Permission Matrix

Legend: **C** = Create, **R** = Read, **U** = Update, **D** = Delete/Revoke, **Own** = Scoped to caller's own records, **Consented** = Scoped to active assignment + active patient consent, **—** = Denied.

| Resource / Capability | `super_admin` | `operations_admin` | `finance_admin` | `support_admin` | `patient` | `doctor` | `hospital` |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Users (`users`)** | C / R / U | R (non-sensitive) | — (via billing DTO) | R (support lookup) | R / U (Own safe fields) | R / U (Own safe fields) | R / U (Own safe fields) |
| **Admin Roles (`admin_roles`)** | C / R / U / D | — | — | — | R (Own) | — | — |
| **Specializations (`specializations`)** | C / R / U / D | C / R / U | R | R | R (active) | R (active) | R (active) |
| **Patient Profile / PHI (`patients`)** | R / U (audited) | R (triage) | — | — (masked ticket view) | C / R / U (Own) | — (API consented contact DTO only) | — (API consented contact DTO only) |
| **Doctors & Specs (`doctors`, `doctor_specializations`)** | R / U | R / U (KYC verify) | R (billing link) | R (basic status) | R (verified only) | C / R / U (Own safe fields) | R (verified only) |
| **Hospitals & Depts (`hospitals`, `hospital_departments`)** | R / U | R / U (KYC verify) | R (billing link) | R (basic status) | R (verified only) | R (verified only) | C / R / U (Own safe fields) |
| **Consent Policies (`consent_policies`)** | C / R / U | R | — | R (active) | R (active) | R (active) | R (active) |
| **Patient Consents (`patient_consents`)** | R / U (compliance) | R (verification) | — | — | C / R / U (Own grant/withdraw) | — | — |
| **Leads (`leads`)** | R / U | R / U (triage/qualify) | — | — | C / R / U (Own draft/cancel) | R (Assigned + Consented) | R (Assigned + Consented) |
| **Lead Assignments (`lead_assignments`)** | C / R / U | C / R / U | — | — | R (Own lead matches) | R / U (Own accept/decline) | R / U (Own accept/decline) |
| **Lead History (`lead_history`)** | C / R | C / R | — | — | R (Own lead safe events) | — (Own assignment state) | — (Own assignment state) |
| **Subscription Plans (`subscription_plans`)** | C / R / U | R | C / R / U | — | — | R (active) | R (active) |
| **Subscriptions (`subscriptions`)** | C / R / U | R (eligibility check) | C / R / U | — | — | R (Own) | R (Own) |
| **Invoices & Payments (`invoices`, `payments`)** | R / U | — | C / R / U | — | — | R (Own) | R (Own) |
| **Notifications (`notifications`)** | R / U | — | — | — | R / U (Own read) | R / U (Own read) | R / U (Own read) |
| **Support Tickets (`support_tickets`)** | R / U | R | — | R / U (incl. internal notes) | C / R / U (Own) | C / R / U (Own) | C / R / U (Own) |
| **Audit Logs (`audit_logs`)** | R | — | — | — | — | — | — |

---

## 4. Dual-Layer Enforcement Architecture

### Layer 1: Backend Middleware & Service Guards (`backend/src/middleware/`)
1. **`authenticateRequest` (`auth.ts`):**
   - Extracts `Authorization: Bearer <jwt>`.
   - Validates token signature/session against Supabase Auth.
   - Queries `public.users` for current `primary_role` and `account_status`. Rejects `suspended`, `deactivated`, or missing accounts with `403`.
   - For administrative roles, additionally queries `public.admin_roles` for an active (`revoked_at IS NULL` and unexpired) scope matching `primary_role`.
   - Rejects any untrusted client headers such as `x-user-role` or `x-user-id`.
2. **`requireRoles(...allowedRoles)` & `requireAdminScope(...)` (`rbac.ts`):**
   - Enforces declarative route-level authorization before controller execution.
3. **Service-Layer Ownership & Consent Checks:**
   - Queries requiring PHI disclosure verify explicit ownership or assignment + `auth_lead_has_active_consent`, emit sanitized DTO projections, and append an `audit_logs` entry.

### Layer 2: Database Row Level Security (`0006_rls_policies.sql`)
- Every user-scoped query executed with `createSupabaseUserClient(userJwt)` inherits PostgreSQL RLS boundaries directly.
- Even if a future backend endpoint omits a filter predicate, PostgreSQL rejects unauthorized cross-tenant reads or writes.

---

## 5. Administrative Lifecycle & Security Controls

1. **Admin Provisioning & Revocation:**
   - Admin accounts cannot self-register via public signup. Only `super_admin` (or controlled initial CLI bootstrap using `service_role`) can assign `primary_role` in `('super_admin', 'operations_admin', 'finance_admin', 'support_admin')` and insert the corresponding `admin_roles` row.
   - Revoking `admin_roles.revoked_at` immediately invalidates RLS helper `auth_has_admin_scope()` and Backend `authenticateRequest` on the very next request — without waiting for JWT expiration.
2. **Mandatory MFA Posture:**
   - TOTP MFA is enabled in `database/supabase/config.toml`. All four admin roles and verified providers are targeted for mandatory MFA enforcement prior to production launch (`users.mfa_enabled = TRUE` check in Phase 2 auth hardening).
3. **Audit Logging Triggers (Backend Mandatory Events):**
   - Admin role grant/revocation, account suspension/reactivation
   - Doctor/hospital verification approval or rejection
   - Patient consent grant or withdrawal
   - Provider viewing consented patient contact / clinical details
   - Manual lead assignment/reassignment
   - Subscription adjustment, refund initiation, or invoice voiding
   - Authorization denial (`outcome = 'denied'`) on sensitive routes
