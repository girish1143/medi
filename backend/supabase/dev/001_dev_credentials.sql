-- ===========================================================================
-- DEVELOPMENT ONLY - local password credentials
-- This file is NOT part of supabase/migrations and is only applied when
-- NODE_ENV !== 'production' by the local migration runner.
-- Production identity is managed exclusively by Supabase Auth.
-- ===========================================================================
create table if not exists dev_credentials (
  profile_id uuid primary key references profiles (id) on delete cascade,
  password_hash text not null,
  created_at timestamptz not null default now()
);

alter table dev_credentials enable row level security;
-- No policies: only the service connection may read this table.
revoke all on dev_credentials from anon, authenticated;

create table if not exists dev_password_resets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table dev_password_resets enable row level security;
revoke all on dev_password_resets from anon, authenticated;
