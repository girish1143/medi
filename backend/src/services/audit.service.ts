import { one } from '../config/database';

export interface AuditEntry {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

/**
 * Audit logging must never break the primary operation. Failures are swallowed
 * after being reported by the database driver.
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await one(
      `insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata, ip_address)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id`,
      [
        entry.actorId ?? null,
        entry.actorRole ?? null,
        entry.action,
        entry.entityType ?? null,
        entry.entityId ?? null,
        JSON.stringify(entry.metadata ?? {}),
        entry.ip ?? null,
      ],
    );
  } catch {
    // Intentionally ignored - audit persistence failure is logged by the pool.
  }
}
