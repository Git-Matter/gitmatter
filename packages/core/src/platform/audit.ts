import { db } from "@workspace/db/client";
import { type AuditEventType, auditEvents } from "@workspace/db/schema";

export interface AuditInput {
  eventType: AuditEventType;
  actorId?: string | null;
  tenantId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  target?: string | null;
  metadata?: unknown;
}

/**
 * Insert a security/operational audit event. Best-effort: auditing must never
 * break the request it observes, so all errors are swallowed.
 */
export async function recordAudit(e: AuditInput): Promise<void> {
  try {
    await db.insert(auditEvents).values({
      eventType: e.eventType,
      actorId: e.actorId ?? null,
      tenantId: e.tenantId ?? null,
      ip: e.ip ?? null,
      userAgent: e.userAgent ?? null,
      target: e.target ?? null,
      metadata: e.metadata ?? null,
    });
  } catch {
    // swallow
  }
}
