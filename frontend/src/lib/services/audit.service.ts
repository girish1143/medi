import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import type { AuditOutcome } from '../domain/enums';

type DbClient = Prisma.TransactionClient | typeof prisma;

const REDACTED_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'authorization',
  'database_url',
  'auth_secret',
  'cardnumber',
  'cvv',
  'pan',
  'enquirydescription',
]);

export interface AuditLogInput {
  actorUserId?: string | null;
  actorRole?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome?: AuditOutcome;
  requestId?: string | null;
  ipHash?: string | null;
  userAgentHash?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Recursively redacts secrets, card fields, and sensitive narrative fields
 * before persisting structured JSON metadata into AuditLog.
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
 * Records an immutable audit event in AuditLog (participates in transactions when passed tx).
 */
export async function recordAuditLog(
  input: AuditLogInput,
  db: DbClient = prisma,
): Promise<void> {
  const safeMetadata = input.metadata
    ? JSON.stringify(sanitizeAuditMetadata(input.metadata))
    : null;

  await db.auditLog.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      actorRole: input.actorRole ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      outcome: input.outcome ?? 'SUCCESS',
      requestId: input.requestId ?? null,
      ipHash: input.ipHash ?? null,
      userAgentHash: input.userAgentHash ?? null,
      metadataJson: safeMetadata,
    },
  });
}
