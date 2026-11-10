import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getBackendEnv, type BackendEnv } from './env.js';

let serviceClient: SupabaseClient | null = null;

/**
 * Creates a user-scoped Supabase client that carries the caller's Bearer JWT
 * so PostgreSQL Row Level Security (RLS) policies execute under the user's identity.
 */
export function createSupabaseUserClient(
  accessToken: string,
  env: BackendEnv = getBackendEnv(),
): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

/**
 * Returns the backend-only Supabase service-role client (bypasses RLS).
 * Restrict usage strictly to privileged server operations (onboarding,
 * matching engine, webhook reconciliation, and immutable audit logging).
 */
export function getSupabaseServiceClient(env: BackendEnv = getBackendEnv()): SupabaseClient {
  if (!serviceClient) {
    serviceClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return serviceClient;
}
