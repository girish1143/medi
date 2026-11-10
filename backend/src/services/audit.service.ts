import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppRole } from '../types/domain.js';

const REDACTED_KEYS = new Set([
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'authorization',
  'apikey',
  'service_role_key',
  'cardnumber',
  'cvv',
  'pan',
  'chief_complaint_summary',
  'clinical_context_notes',
  'emergency_contact_phone',
]);

export interface AuditEventInput {
  actorUserId: string | null;
  actorRole: AppRole | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome?: 'success' | 'denied' | 'failure';
  requestId?: string | null;
  ipHash?: string | null;
  userAgentHash?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Recursively strips sensitive credentials, card identifiers, and clinical PHI
 * keys before storing metadata in immutable audit_logs.
 */
export function sanitizeAuditMetadata(value: unknown, depth = 0): unknown {
  if (depth > 5) {
    return '[TRUNCATED_DEPTH]';
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditMetadata(item, depth + 1));
  }
  if (value !== null && typeof value === 'object') {
    const clean: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (REDACTED_KEYS.has(key.toLowerCase())) {
        clean[key] = '[REDACTED]';
      } else {
        clean[key] = sanitizeAuditMetadata(entry, depth + 1);
      }
    }
    return clean;
  }
  return value;
}

/**
 * Appends an immutable compliance event to public.audit_logs using the
 * backend service-role client.
 */
export async function recordAuditEvent(
  supabaseAdmin: SupabaseClient,
  event: AuditEventInput,
): Promise<void> {
  const safeMetadata = sanitizeAuditMetadata(event.metadata ?? {});
  const { error } = await supabaseAdmin.from('audit_logs').insert({
    actor_user_id: event.actorUserId,
    actor_role: event.actorRole,
    action: event.action,
    resource_type: event.resourceType,
    resource_id: event.resourceId ?? null,
    outcome: event.outcome ?? 'success',
    request_id: event.requestId ?? null,
    ip_hash: event.ipHash ?? null,
    user_agent_hash: event.userAgentHash ?? null,
    metadata: safeMetadata,
  });

  if (error) {
    throw new Error(`Failed to persist audit event '${event.action}': ${error.message}`);
  }
}
