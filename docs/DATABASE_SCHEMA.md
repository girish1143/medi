# Database schema

PostgreSQL 18 / Supabase PostgreSQL. Migrations live in `backend/supabase/migrations/`:

| File | Purpose |
| --- | --- |
| `0001_init.sql` | Extensions, enums, tables, constraints, indexes, triggers and seed helpers |
| `0002_rls.sql` | Row Level Security policies and helper functions |
| `0003_storage.sql` | Private storage buckets for medical records and avatars |

Reference/demo data is loaded from `backend/supabase/seed.sql` plus `src/config/seedData.ts`.

## Enumerated types

| Type | Values |
| --- | --- |
| `user_role` | `patient`, `doctor`, `admin`, `receptionist` |
| `verification_status` | `pending`, `verified`, `rejected`, `suspended` |
| `gender_type` | `male`, `female`, `other`, `prefer_not_to_say` |
| `appointment_type` | `in_clinic`, `online` |
| `appointment_status` | `pending`, `confirmed`, `checked_in`, `in_progress`, `completed`, `cancelled`, `rejected`, `no_show` |
| `payment_status` | `pending`, `paid`, `failed`, `refunded`, `partially_refunded`, `cancelled` |
| `payment_provider` | `razorpay`, `pay_at_clinic`, `manual` |
| `payment_txn_status` | `created`, `captured`, `failed`, `refunded`, `partially_refunded` |
| `refund_status` | `requested`, `processing`, `processed`, `failed` |
| `record_type` | `lab_report`, `prescription`, `scan`, `discharge_summary`, `other` |
| `notification_channel` | `in_app`, `email`, `sms` |
| `notification_status` | `queued`, `sent`, `failed`, `read` |
| `complaint_status` | `open`, `in_review`, `resolved`, `rejected` |

## Tables

### Identity

**auth.users** — local development shim only; on Supabase this is the managed auth table.

**profiles** — one row per user, mirrors `auth.users.id`.

| Column | Notes |
| --- | --- |
| `id` uuid PK | FK → `auth.users(id)` on delete cascade |
| `full_name`, `email` | `email` unique |
| `phone` | optional |
| `role` `user_role` | defaults to `patient` |
| `avatar_url` | signed storage URL |
| `is_active` | disables sign-in |
| `last_login_at` | updated on login |

Indexes: `profiles_role_idx`, `profiles_email_idx` (lower(email)).

**auth_sessions** — refresh-token sessions. Stores `token_hash` (SHA-256), expiry, user agent and IP; never the raw token.

**dev_credentials** — local-only bcrypt hashes used when `AUTH_PROVIDER=local`. Never created in production.

**patients** — `profile_id` unique FK, `date_of_birth` (must be in the past), `gender`, `blood_group`, `emergency_contact`, `address`.

**user_addresses** — optional saved addresses per profile.

### Doctors and directory

**doctors** — `profile_id` unique, `registration_number` unique, `qualification`, `experience_years` (0–70), `biography`, `languages` text[], `consultation_fee`, `online_consultation_fee`, `verification_status`, `verified_at/by`, `is_active`, `average_rating` (0–5), `total_reviews`.

Indexes: status, active, fee.

**specialties** — `name` and `slug` unique, `description`, `icon`, `is_active`.

**doctor_specialties** — composite PK `(doctor_id, specialty_id)`, cascade on doctor delete, restrict on specialty delete.

**clinics** — name, address, area, city, state, `pincode`, phone, email, lat/long, `is_active`; unique `(name, city)`.

**doctor_clinics** — composite PK `(doctor_id, clinic_id)`.

**doctor_availability** — one row per weekday (0 = Sunday). `start_time`, `end_time`, `slot_minutes ∈ {15,20,30,60}`, optional `break_start`/`break_end`.

Constraints: `end_time > start_time`; break ordered and inside the working window.

**doctor_time_off** — leave/holiday ranges with `starts_at < ends_at`.

### Appointments

**appointments** — core booking row.

| Column | Notes |
| --- | --- |
| `appointment_number` | human-readable, unique, from `appointment_number_seq` |
| `patient_id` → patients | on delete restrict |
| `doctor_id` → doctors | on delete restrict |
| `clinic_id` → clinics | on delete set null |
| `starts_at`, `ends_at` timestamptz | stored in UTC |
| `appointment_date` | generated column: IST date |
| `appointment_type` | in_clinic / online |
| `status`, `payment_status` | enums |
| `consultation_fee` | numeric(10,2), ≥ 0 |
| `reason`, `doctor_notes`, `cancellation_reason`, `cancelled_by` | |
| `rescheduled_from` | self-reference |
| `checked_in_at`, `completed_at`, `created_by` | |

Double-booking guards:

```sql
alter table appointments add constraint appointments_no_overlap
  exclude using gist (
    doctor_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pending','confirmed','checked_in','in_progress'));

create unique index appointments_active_slot_uniq
  on appointments (doctor_id, starts_at)
  where status in ('pending','confirmed','checked_in','in_progress');
```

Other checks: `ends_at > starts_at`, duration ≤ 4 hours.

Indexes: `(doctor_id, starts_at)`, `(patient_id, starts_at desc)`, `appointment_date`, `status`, `payment_status`, `clinic_id`.

**appointment_status_history** — append-only: `from_status`, `to_status`, `changed_by`, `note`, `created_at`, indexed by appointment and time.

### Payments

**payments** — one row per payment attempt.

| Column | Notes |
| --- | --- |
| `appointment_id` → appointments | cascade |
| `patient_id` → patients | restrict |
| `amount` numeric(10,2) | > 0 |
| `currency` char(3) | default INR |
| `payment_provider` | razorpay / pay_at_clinic / manual |
| `provider_order_id`, `provider_payment_id` | unique when present |
| `provider_signature` | checkout signature |
| `status` | created / captured / failed / refunded / partially_refunded |
| `idempotency_key` | unique |
| `paid_at`, `failure_reason` | |

**refunds** — `payment_id`, `appointment_id`, `amount > 0`, `reason`, `status`, `provider_refund_id`, `requested_by`, `processed_by/at`.

### Clinical records

**prescriptions** — unique `appointment_id`, `prescription_number` unique, `patient_id`, `doctor_id`, `diagnosis`, `notes`, `follow_up_date`.

**prescription_items** — `prescription_id` cascade, medicine, dosage, frequency, duration, instructions, `sort_order`.

**medical_records** — `patient_id` cascade, optional `appointment_id` set null, `file_path`, `file_name`, `file_type`, `file_size > 0`, `record_type`, `uploaded_by`, soft delete via `deleted_at`.

### Engagement and operations

**reviews** — unique `appointment_id`, `patient_id`, `doctor_id`, `rating` 1–5, `comment`, `is_visible`. Doctor aggregates (`average_rating`, `total_reviews`) are updated on write.

**notifications** — `profile_id`, optional `appointment_id`, `title`, `body`, `type`, `channel`, `status`, `read_at`, unique `idempotency_key`.

**audit_logs** — bigserial id, `actor_id`, `actor_role`, `action`, `entity_type`, `entity_id`, `metadata jsonb`, `ip_address inet`, `created_at`. Append-only.

**platform_settings** — key/value JSONB store (`booking_min_notice_minutes`, `cancellation_min_hours`, `pay_at_clinic_enabled`, `maintenance_mode`, support contacts, etc.).

**complaints** — `profile_id`, optional `appointment_id`, `subject`, `description`, `status`, `resolution`, `resolved_by`.

## Relationships

```
auth.users 1─1 profiles
profiles   1─1 patients         profiles 1─1 doctors
patients   1─n appointments     doctors  1─n appointments
doctors    n─n specialties      doctors  n─n clinics
doctors    1─n doctor_availability / doctor_time_off
appointments 1─n appointment_status_history
appointments 1─n payments       payments 1─n refunds
appointments 1─1 prescriptions  prescriptions 1─n prescription_items
patients   1─n medical_records  appointments 1─1 reviews
profiles   1─n notifications / user_addresses / complaints
profiles   1─n audit_logs (actor)
```

## Row Level Security

RLS is enabled on every application table in `0002_rls.sql`. Helper functions (`auth.uid()`, `public.is_admin()`, doctor/patient relationship checks) keep policies readable.

| Table | Patient | Doctor | Admin | Receptionist |
| --- | --- | --- | --- | --- |
| profiles | own row | own row | all (via service role) | own row |
| patients | own row | rows for related appointments | all | operational fields only |
| doctors / specialties / clinics / availability | public read (verified + active) | manage own | all | read |
| appointments | own | assigned | all | operational (booking/check-in) |
| appointment_status_history | own appointments | own appointments | all | operational |
| payments / refunds | own | related appointments | all | collect only |
| prescriptions / items | own (read) | create/update own consultations | read | **no access** |
| medical_records | own | related patients | metadata only | **no access** |
| reviews | own (insert) | read own | moderate | read |
| notifications | own | own | own | own |
| audit_logs | no | no | read | no |
| platform_settings | read | read | write | read |

The API connects with the Supabase service role and enforces the same rules in services, so RLS is defence in depth rather than the only guard.

## Migration and seed commands

```bash
cd backend
npm run db:migrate   # apply pending SQL migrations
npm run db:seed      # reference + demo data
npm run db:reset     # drop, recreate and reseed the local database
```

Migrations are idempotent (`if not exists`, guarded `do $$` blocks) and are applied automatically on API start when `AUTO_MIGRATE=true`.
