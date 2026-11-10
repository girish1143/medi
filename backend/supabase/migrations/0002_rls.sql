-- ===========================================================================
-- MediBook - Authentication sessions, RLS policies, grants
-- ===========================================================================

-- Server-side refresh sessions. Only a SHA-256 hash of the refresh token is
-- persisted so a database leak cannot be replayed against the API.
create table if not exists auth_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  refresh_token_hash text not null unique,
  auth_provider text not null default 'local',
  user_agent text,
  ip_address inet,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists auth_sessions_profile_idx on auth_sessions (profile_id);
create index if not exists auth_sessions_expiry_idx on auth_sessions (expires_at);

-- ---------------------------------------------------------------------------
-- Roles used by Supabase RLS. Created locally when missing (Supabase has them).
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Helper functions (security definer avoids recursive RLS evaluation)
-- ---------------------------------------------------------------------------
create or replace function public.current_profile_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.current_patient_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.patients where profile_id = auth.uid()
$$;

create or replace function public.current_doctor_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.doctors where profile_id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin') from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin', 'receptionist') from public.profiles where id = auth.uid()), false)
$$;

-- A doctor may read a patient only when a clinical relationship exists.
create or replace function public.doctor_treats_patient(p_patient_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.appointments a
     join public.doctors d on d.id = a.doctor_id
    where a.patient_id = p_patient_id and d.profile_id = auth.uid()
  )
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','patients','doctors','specialties','doctor_specialties','clinics',
    'doctor_clinics','doctor_availability','doctor_time_off','appointments',
    'appointment_status_history','payments','refunds','prescriptions',
    'prescription_items','medical_records','reviews','notifications',
    'user_addresses','audit_logs','platform_settings','complaints','auth_sessions'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select_own on profiles;
create policy profiles_select_own on profiles for select
  using (id = auth.uid() or public.is_admin()
         or (public.current_profile_role() = 'receptionist')
         or (public.current_profile_role() = 'doctor' and exists (
              select 1 from patients p where p.profile_id = profiles.id
              and public.doctor_treats_patient(p.id)
         )));
drop policy if exists profiles_insert_own on profiles;
create policy profiles_insert_own on profiles for insert
  with check (id = auth.uid());
drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles for update
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- patients
-- ---------------------------------------------------------------------------
drop policy if exists patients_select on patients;
create policy patients_select on patients for select
  using (profile_id = auth.uid() or public.is_admin()
         or public.current_profile_role() = 'receptionist'
         or public.doctor_treats_patient(id));
drop policy if exists patients_manage_own on patients;
create policy patients_manage_own on patients for update
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());
drop policy if exists patients_insert_own on patients;
create policy patients_insert_own on patients for insert
  with check (profile_id = auth.uid() or public.is_staff());

-- ---------------------------------------------------------------------------
-- doctors & directory data
-- ---------------------------------------------------------------------------
drop policy if exists doctors_select on doctors;
create policy doctors_select on doctors for select
  using ((is_active and verification_status = 'verified')
         or profile_id = auth.uid() or public.is_admin() or public.is_staff());
drop policy if exists doctors_update on doctors;
create policy doctors_update on doctors for update
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());
drop policy if exists doctors_insert on doctors;
create policy doctors_insert on doctors for insert
  with check (profile_id = auth.uid() or public.is_admin());

drop policy if exists specialties_select on specialties;
create policy specialties_select on specialties for select using (true);
drop policy if exists clinics_select on clinics;
create policy clinics_select on clinics for select using (true);
drop policy if exists doctor_specialties_select on doctor_specialties;
create policy doctor_specialties_select on doctor_specialties for select using (true);
drop policy if exists doctor_clinics_select on doctor_clinics;
create policy doctor_clinics_select on doctor_clinics for select using (true);
drop policy if exists doctor_availability_select on doctor_availability;
create policy doctor_availability_select on doctor_availability for select using (true);

drop policy if exists specialties_admin on specialties;
create policy specialties_admin on specialties for all
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists clinics_admin on clinics;
create policy clinics_admin on clinics for all
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists doctor_specialties_manage on doctor_specialties;
create policy doctor_specialties_manage on doctor_specialties for all
  using (doctor_id = public.current_doctor_id() or public.is_admin())
  with check (doctor_id = public.current_doctor_id() or public.is_admin());
drop policy if exists doctor_clinics_manage on doctor_clinics;
create policy doctor_clinics_manage on doctor_clinics for all
  using (doctor_id = public.current_doctor_id() or public.is_admin())
  with check (doctor_id = public.current_doctor_id() or public.is_admin());
drop policy if exists doctor_availability_manage on doctor_availability;
create policy doctor_availability_manage on doctor_availability for all
  using (doctor_id = public.current_doctor_id() or public.is_admin())
  with check (doctor_id = public.current_doctor_id() or public.is_admin());
drop policy if exists doctor_time_off_select on doctor_time_off;
create policy doctor_time_off_select on doctor_time_off for select
  using (doctor_id = public.current_doctor_id() or public.is_admin());
drop policy if exists doctor_time_off_manage on doctor_time_off;
create policy doctor_time_off_manage on doctor_time_off for all
  using (doctor_id = public.current_doctor_id() or public.is_admin())
  with check (doctor_id = public.current_doctor_id() or public.is_admin());

-- ---------------------------------------------------------------------------
-- appointments & history
-- ---------------------------------------------------------------------------
drop policy if exists appointments_select on appointments;
create policy appointments_select on appointments for select
  using (
    patient_id = public.current_patient_id()
    or doctor_id = public.current_doctor_id()
    or public.is_admin()
    or (public.current_profile_role() = 'receptionist')
  );
drop policy if exists appointments_insert on appointments;
create policy appointments_insert on appointments for insert
  with check (
    patient_id = public.current_patient_id()
    or public.is_staff()
    or doctor_id = public.current_doctor_id()
  );
drop policy if exists appointments_update on appointments;
create policy appointments_update on appointments for update
  using (
    patient_id = public.current_patient_id()
    or doctor_id = public.current_doctor_id()
    or public.is_staff()
  )
  with check (
    patient_id = public.current_patient_id()
    or doctor_id = public.current_doctor_id()
    or public.is_staff()
  );

drop policy if exists appointment_history_select on appointment_status_history;
create policy appointment_history_select on appointment_status_history for select
  using (exists (
    select 1 from appointments a where a.id = appointment_id
    and (a.patient_id = public.current_patient_id()
         or a.doctor_id = public.current_doctor_id()
         or public.is_staff())
  ));
drop policy if exists appointment_history_insert on appointment_status_history;
create policy appointment_history_insert on appointment_status_history for insert
  with check (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- payments & refunds
-- ---------------------------------------------------------------------------
drop policy if exists payments_select on payments;
create policy payments_select on payments for select
  using (patient_id = public.current_patient_id() or public.is_admin());
drop policy if exists payments_insert on payments;
create policy payments_insert on payments for insert
  with check (patient_id = public.current_patient_id() or public.is_admin());
drop policy if exists refunds_select on refunds;
create policy refunds_select on refunds for select
  using (
    public.is_admin() or exists (
      select 1 from payments p where p.id = payment_id
      and p.patient_id = public.current_patient_id()
    )
  );

-- ---------------------------------------------------------------------------
-- prescriptions & medical records
-- ---------------------------------------------------------------------------
drop policy if exists prescriptions_select on prescriptions;
create policy prescriptions_select on prescriptions for select
  using (
    patient_id = public.current_patient_id()
    or doctor_id = public.current_doctor_id()
    or public.is_admin()
  );
drop policy if exists prescriptions_insert on prescriptions;
create policy prescriptions_insert on prescriptions for insert
  with check (doctor_id = public.current_doctor_id() or public.is_admin());
drop policy if exists prescriptions_update on prescriptions;
create policy prescriptions_update on prescriptions for update
  using (doctor_id = public.current_doctor_id() or public.is_admin())
  with check (doctor_id = public.current_doctor_id() or public.is_admin());

drop policy if exists prescription_items_select on prescription_items;
create policy prescription_items_select on prescription_items for select
  using (exists (
    select 1 from prescriptions p where p.id = prescription_id
    and (p.patient_id = public.current_patient_id()
         or p.doctor_id = public.current_doctor_id()
         or public.is_admin())
  ));
drop policy if exists prescription_items_manage on prescription_items;
create policy prescription_items_manage on prescription_items for all
  using (exists (
    select 1 from prescriptions p where p.id = prescription_id
    and (p.doctor_id = public.current_doctor_id() or public.is_admin())
  ))
  with check (exists (
    select 1 from prescriptions p where p.id = prescription_id
    and (p.doctor_id = public.current_doctor_id() or public.is_admin())
  ));

drop policy if exists medical_records_select on medical_records;
create policy medical_records_select on medical_records for select
  using (
    patient_id = public.current_patient_id()
    or public.is_admin()
    or public.doctor_treats_patient(patient_id)
  );
drop policy if exists medical_records_insert on medical_records;
create policy medical_records_insert on medical_records for insert
  with check (
    uploaded_by = auth.uid()
    and (patient_id = public.current_patient_id() or public.is_admin()
         or public.current_doctor_id() is not null)
  );
drop policy if exists medical_records_update on medical_records;
create policy medical_records_update on medical_records for update
  using (patient_id = public.current_patient_id() or public.is_admin())
  with check (patient_id = public.current_patient_id() or public.is_admin());

-- ---------------------------------------------------------------------------
-- reviews, notifications, addresses, complaints
-- ---------------------------------------------------------------------------
drop policy if exists reviews_select on reviews;
create policy reviews_select on reviews for select
  using (is_visible or patient_id = public.current_patient_id() or public.is_admin());
drop policy if exists reviews_insert on reviews;
create policy reviews_insert on reviews for insert
  with check (
    patient_id = public.current_patient_id()
    and exists (
      select 1 from appointments a
      where a.id = appointment_id
        and a.patient_id = public.current_patient_id()
        and a.status = 'completed'
    )
  );
drop policy if exists reviews_admin on reviews;
create policy reviews_admin on reviews for update
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists notifications_select on notifications;
create policy notifications_select on notifications for select
  using (profile_id = auth.uid());
drop policy if exists notifications_update on notifications;
create policy notifications_update on notifications for update
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists user_addresses_own on user_addresses;
create policy user_addresses_own on user_addresses for all
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

drop policy if exists complaints_own on complaints;
create policy complaints_own on complaints for all
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

drop policy if exists audit_logs_admin on audit_logs;
create policy audit_logs_admin on audit_logs for select using (public.is_admin());

drop policy if exists platform_settings_select on platform_settings;
create policy platform_settings_select on platform_settings for select using (true);
drop policy if exists platform_settings_admin on platform_settings;
create policy platform_settings_admin on platform_settings for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists auth_sessions_own on auth_sessions;
create policy auth_sessions_own on auth_sessions for select using (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Privileges (Supabase roles)
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on specialties, clinics, doctor_specialties, doctor_clinics,
  doctor_availability, doctors to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to anon, authenticated;
