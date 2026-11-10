-- ===========================================================================
-- MediBook - Core schema (Supabase PostgreSQL compatible)
-- ===========================================================================

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- Local development compatibility shim.
-- On Supabase these objects already exist; the blocks are skipped.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'auth') then
    create schema auth;
  end if;
  if to_regclass('auth.users') is null then
    create table auth.users (
      id uuid primary key default gen_random_uuid(),
      email text unique not null,
      created_at timestamptz not null default now()
    );
  end if;
end $$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant usage on schema auth to public;

-- ---------------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('patient', 'doctor', 'admin', 'receptionist');
exception when duplicate_object then null; end $$;

do $$ begin
  create type verification_status as enum ('pending', 'verified', 'rejected', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type gender_type as enum ('male', 'female', 'other', 'prefer_not_to_say');
exception when duplicate_object then null; end $$;

do $$ begin
  create type appointment_type as enum ('in_clinic', 'online');
exception when duplicate_object then null; end $$;

do $$ begin
  create type appointment_status as enum (
    'pending', 'confirmed', 'checked_in', 'in_progress',
    'completed', 'cancelled', 'rejected', 'no_show'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_provider as enum ('razorpay', 'pay_at_clinic', 'manual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_txn_status as enum ('created', 'captured', 'failed', 'refunded', 'partially_refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type refund_status as enum ('requested', 'approved', 'processed', 'rejected', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type record_type as enum ('lab_report', 'prescription', 'consultation_summary', 'imaging', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type notification_channel as enum ('in_app', 'email', 'sms');
exception when duplicate_object then null; end $$;

do $$ begin
  create type notification_status as enum ('queued', 'sent', 'failed', 'read');
exception when duplicate_object then null; end $$;

do $$ begin
  create type complaint_status as enum ('open', 'in_review', 'resolved', 'rejected');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------
create table if not exists specialties (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  icon text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address_line1 text not null,
  area text,
  city text not null,
  state text not null,
  pincode text not null,
  phone text,
  email text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists clinics_city_idx on clinics (city);
create unique index if not exists clinics_name_city_uniq on clinics (name, city);

-- ---------------------------------------------------------------------------
-- Identity (profiles mirror auth.users)
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null unique,
  phone text,
  role user_role not null default 'patient',
  avatar_url text,
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists profiles_role_idx on profiles (role);
create index if not exists profiles_email_idx on profiles (lower(email));

create table if not exists patients (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references profiles (id) on delete cascade,
  date_of_birth date,
  gender gender_type,
  blood_group text,
  emergency_contact text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patients_dob_past check (date_of_birth is null or date_of_birth < current_date)
);

create table if not exists user_addresses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  label text not null default 'Home',
  line1 text not null,
  line2 text,
  area text,
  city text not null,
  state text not null,
  pincode text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists user_addresses_profile_idx on user_addresses (profile_id);

create table if not exists doctors (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references profiles (id) on delete cascade,
  registration_number text not null unique,
  qualification text not null,
  experience_years integer not null default 0 check (experience_years >= 0 and experience_years <= 70),
  biography text,
  languages text[] not null default array['English', 'Hindi'],
  consultation_fee numeric(10, 2) not null check (consultation_fee >= 0),
  online_consultation_fee numeric(10, 2) check (online_consultation_fee >= 0),
  verification_status verification_status not null default 'pending',
  verified_at timestamptz,
  verified_by uuid references profiles (id),
  is_active boolean not null default true,
  average_rating numeric(3, 2) not null default 0 check (average_rating between 0 and 5),
  total_reviews integer not null default 0 check (total_reviews >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists doctors_status_idx on doctors (verification_status);
create index if not exists doctors_active_idx on doctors (is_active);
create index if not exists doctors_fee_idx on doctors (consultation_fee);

create table if not exists doctor_specialties (
  doctor_id uuid not null references doctors (id) on delete cascade,
  specialty_id uuid not null references specialties (id) on delete restrict,
  is_primary boolean not null default false,
  primary key (doctor_id, specialty_id)
);
create index if not exists doctor_specialties_specialty_idx on doctor_specialties (specialty_id);
create unique index if not exists doctor_specialties_one_primary
  on doctor_specialties (doctor_id) where is_primary;

create table if not exists doctor_clinics (
  doctor_id uuid not null references doctors (id) on delete cascade,
  clinic_id uuid not null references clinics (id) on delete cascade,
  consultation_fee numeric(10, 2),
  is_primary boolean not null default false,
  primary key (doctor_id, clinic_id)
);
create unique index if not exists doctor_clinics_one_primary
  on doctor_clinics (doctor_id) where is_primary;

-- weekday: 0 = Sunday .. 6 = Saturday. Multiple blocks per day allowed.
create table if not exists doctor_availability (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references doctors (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  slot_minutes integer not null default 30 check (slot_minutes in (15, 20, 30, 60)),
  break_start time,
  break_end time,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint availability_time_order check (end_time > start_time),
  constraint availability_break_order check (
    break_start is null or break_end is null or break_end > break_start
  ),
  constraint availability_break_within check (
    break_start is null or break_end is null or
    (break_start >= start_time and break_end <= end_time)
  )
);
create index if not exists doctor_availability_doctor_idx on doctor_availability (doctor_id, weekday);

create table if not exists doctor_time_off (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references doctors (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  constraint time_off_order check (ends_at > starts_at)
);
create index if not exists doctor_time_off_doctor_idx on doctor_time_off (doctor_id, starts_at);

-- ---------------------------------------------------------------------------
-- Appointments
-- ---------------------------------------------------------------------------
create sequence if not exists appointment_number_seq start 1001;

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  appointment_number text not null unique,
  patient_id uuid not null references patients (id) on delete restrict,
  doctor_id uuid not null references doctors (id) on delete restrict,
  clinic_id uuid references clinics (id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  appointment_date date generated always as ((starts_at at time zone 'Asia/Kolkata')::date) stored,
  appointment_type appointment_type not null default 'in_clinic',
  status appointment_status not null default 'pending',
  consultation_fee numeric(10, 2) not null check (consultation_fee >= 0),
  payment_status payment_status not null default 'pending',
  reason text,
  doctor_notes text,
  cancellation_reason text,
  cancelled_by uuid references profiles (id),
  rescheduled_from uuid references appointments (id),
  checked_in_at timestamptz,
  completed_at timestamptz,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointment_time_order check (ends_at > starts_at),
  constraint appointment_duration_max check (ends_at <= starts_at + interval '4 hours')
);

-- A doctor can never have two active appointments that overlap, even under
-- concurrent requests. This is the database-level double-booking guard.
alter table appointments drop constraint if exists appointments_no_overlap;
alter table appointments add constraint appointments_no_overlap
  exclude using gist (
    doctor_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pending', 'confirmed', 'checked_in', 'in_progress'));

create unique index if not exists appointments_active_slot_uniq
  on appointments (doctor_id, starts_at)
  where status in ('pending', 'confirmed', 'checked_in', 'in_progress');

create index if not exists appointments_doctor_idx on appointments (doctor_id, starts_at);
create index if not exists appointments_patient_idx on appointments (patient_id, starts_at desc);
create index if not exists appointments_date_idx on appointments (appointment_date);
create index if not exists appointments_status_idx on appointments (status);
create index if not exists appointments_payment_status_idx on appointments (payment_status);
create index if not exists appointments_clinic_idx on appointments (clinic_id);

create table if not exists appointment_status_history (
  id bigserial primary key,
  appointment_id uuid not null references appointments (id) on delete cascade,
  from_status appointment_status,
  to_status appointment_status not null,
  changed_by uuid references profiles (id),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists appointment_history_appointment_idx
  on appointment_status_history (appointment_id, created_at);

-- ---------------------------------------------------------------------------
-- Payments & refunds
-- ---------------------------------------------------------------------------
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments (id) on delete cascade,
  patient_id uuid not null references patients (id) on delete restrict,
  amount numeric(10, 2) not null check (amount > 0),
  currency char(3) not null default 'INR',
  payment_provider payment_provider not null default 'razorpay',
  provider_order_id text,
  provider_payment_id text,
  provider_signature text,
  status payment_txn_status not null default 'created',
  paid_at timestamptz,
  failure_reason text,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payments_appointment_idx on payments (appointment_id);
create index if not exists payments_patient_idx on payments (patient_id, created_at desc);
create index if not exists payments_status_idx on payments (status);
create unique index if not exists payments_provider_payment_uniq
  on payments (provider_payment_id) where provider_payment_id is not null;
create unique index if not exists payments_provider_order_uniq
  on payments (provider_order_id) where provider_order_id is not null;

create table if not exists refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments (id) on delete restrict,
  appointment_id uuid not null references appointments (id) on delete restrict,
  amount numeric(10, 2) not null check (amount > 0),
  reason text not null,
  status refund_status not null default 'requested',
  provider_refund_id text,
  requested_by uuid references profiles (id),
  processed_by uuid references profiles (id),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists refunds_payment_idx on refunds (payment_id);
create index if not exists refunds_status_idx on refunds (status);

-- ---------------------------------------------------------------------------
-- Clinical records
-- ---------------------------------------------------------------------------
create sequence if not exists prescription_number_seq start 5001;

create table if not exists prescriptions (
  id uuid primary key default gen_random_uuid(),
  prescription_number text not null unique,
  appointment_id uuid not null unique references appointments (id) on delete cascade,
  patient_id uuid not null references patients (id) on delete restrict,
  doctor_id uuid not null references doctors (id) on delete restrict,
  diagnosis text not null,
  notes text,
  follow_up_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists prescriptions_patient_idx on prescriptions (patient_id, created_at desc);
create index if not exists prescriptions_doctor_idx on prescriptions (doctor_id, created_at desc);

create table if not exists prescription_items (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references prescriptions (id) on delete cascade,
  medicine_name text not null,
  dosage text not null,
  frequency text not null,
  duration text not null,
  instructions text,
  sort_order integer not null default 0
);
create index if not exists prescription_items_prescription_idx
  on prescription_items (prescription_id, sort_order);

create table if not exists medical_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  appointment_id uuid references appointments (id) on delete set null,
  file_path text not null,
  file_name text not null,
  file_type text not null,
  file_size integer not null check (file_size > 0),
  record_type record_type not null default 'other',
  uploaded_by uuid not null references profiles (id),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists medical_records_patient_idx
  on medical_records (patient_id, created_at desc);
create index if not exists medical_records_appointment_idx on medical_records (appointment_id);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references appointments (id) on delete cascade,
  patient_id uuid not null references patients (id) on delete cascade,
  doctor_id uuid not null references doctors (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reviews_doctor_idx on reviews (doctor_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Notifications, audit, settings, complaints
-- ---------------------------------------------------------------------------
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  appointment_id uuid references appointments (id) on delete set null,
  title text not null,
  body text not null,
  type text not null,
  channel notification_channel not null default 'in_app',
  status notification_status not null default 'queued',
  read_at timestamptz,
  idempotency_key text unique,
  created_at timestamptz not null default now()
);
create index if not exists notifications_profile_idx
  on notifications (profile_id, created_at desc);
create index if not exists notifications_unread_idx
  on notifications (profile_id) where read_at is null;

create table if not exists audit_logs (
  id bigserial primary key,
  actor_id uuid references profiles (id) on delete set null,
  actor_role user_role,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_actor_idx on audit_logs (actor_id, created_at desc);
create index if not exists audit_logs_entity_idx on audit_logs (entity_type, entity_id);
create index if not exists audit_logs_created_idx on audit_logs (created_at desc);

create table if not exists platform_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

create table if not exists complaints (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  appointment_id uuid references appointments (id) on delete set null,
  subject text not null,
  description text not null,
  status complaint_status not null default 'open',
  resolution text,
  resolved_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists complaints_status_idx on complaints (status, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'specialties','clinics','profiles','patients','doctors','doctor_availability',
    'appointments','payments','refunds','prescriptions','reviews','complaints'
  ] loop
    execute format('drop trigger if exists %I_set_updated_at on %I', t, t);
    execute format(
      'create trigger %I_set_updated_at before update on %I for each row execute function set_updated_at()',
      t, t
    );
  end loop;
end $$;

-- Keep doctor aggregate rating in sync with visible reviews.
create or replace function refresh_doctor_rating()
returns trigger language plpgsql as $$
declare target uuid;
begin
  target := coalesce(new.doctor_id, old.doctor_id);
  update doctors d
     set average_rating = coalesce((
           select round(avg(r.rating)::numeric, 2) from reviews r
            where r.doctor_id = target and r.is_visible
         ), 0),
         total_reviews = (
           select count(*) from reviews r
            where r.doctor_id = target and r.is_visible
         )
   where d.id = target;
  return null;
end;
$$;

drop trigger if exists reviews_refresh_rating on reviews;
create trigger reviews_refresh_rating
after insert or update or delete on reviews
for each row execute function refresh_doctor_rating();
