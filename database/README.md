# Database Layer (`database/`)

This directory contains the PostgreSQL / Supabase schema migrations and configuration for the Healthcare Lead Generation Platform.

## Migration Ordering

Apply migrations strictly in numerical order against a Supabase PostgreSQL 15+ database (where the managed `auth` schema and `auth.users` already exist):

1. `migrations/0001_extensions_and_enums.sql` — Extensions (`pgcrypto`), domain enums, `set_updated_at()`, and `prevent_immutable_row_mutation()`.
2. `migrations/0002_identity_and_rbac.sql` — `users`, `admin_roles`, alignment triggers, and `SECURITY DEFINER` RBAC RLS helper functions.
3. `migrations/0003_patients_providers_and_specializations.sql` — `specializations`, `patients`, `hospitals`, `hospital_departments`, `doctors`, and `doctor_specializations`.
4. `migrations/0004_consent_and_leads.sql` — `consent_policies`, `patient_consents`, `leads`, `lead_assignments`, `lead_history`, and consent verification RLS helper.
5. `migrations/0005_billing_notifications_support_audit.sql` — `subscription_plans`, `subscriptions`, `invoices`, `payments`, `notifications`, `support_tickets`, `support_ticket_messages`, and `audit_logs`.
6. `migrations/0006_rls_policies.sql` — Anti-privilege-escalation triggers, RLS ownership helpers, and Row Level Security policies across all 21 tables.

## Zero-Seed-Data Policy

All migration files are strictly **DDL-only**. No fake patients, doctors, hospitals, leads, transactions, or users are created automatically. The database starts empty.

Canonical clinical specializations, initial `consent_policies`, and `subscription_plans` must be provisioned explicitly by an authenticated `super_admin` or via controlled bootstrap tooling outside versioned migrations.

## Verification

- Using Supabase CLI (when linked to a local or remote Supabase project):
  ```bash
  supabase db reset
  ```
- Remember to test RLS policies with role-scoped JWTs (`patient`, `doctor`, `hospital`, and all four admin scopes) before deploying to staging or production.
