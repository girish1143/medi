import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../../config/env';
import { AppError } from '../../utils/errors';

let adminClient: SupabaseClient | null = null;
let anonClient: SupabaseClient | null = null;

export function supabaseConfigured(): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);
}

export function getSupabaseAdmin(): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new AppError(500, 'SUPABASE_NOT_CONFIGURED', 'Supabase service credentials are not configured');
  }
  if (!adminClient) {
    adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return adminClient;
}

export function getSupabaseAnon(): SupabaseClient {
  if (!supabaseConfigured()) {
    throw new AppError(500, 'SUPABASE_NOT_CONFIGURED', 'Supabase credentials are not configured');
  }
  if (!anonClient) {
    anonClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return anonClient;
}
