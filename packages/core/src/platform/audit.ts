import { db, type Tx } from "@workspace/db/client";
import { type AuditEventType, auditEvents } from "@workspace/db/schema";
import { createBatchWriter } from "./batch-writer.js";

export interface AuditInput {
  eventType: AuditEventType;
  actorId?: string | null;
  tenantId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  target?: string | null;
  metadata?: unknown;
}

type AuditRow = typeof auditEvents.$inferInsert;

// Audit events are high-volume and best-effort, so they are batched: rows buffer
// in memory and flush as one multi-row insert (see batch-writer). The write no
// longer happens per call on the hot path.
const auditWriter = createBatchWriter<AuditRow>(
  async (rows) => {
    await db.insert(auditEvents).values(rows);
  },
  { maxRows: 100, maxDelayMs: 1000 }
);

/**
 * Record a security/operational audit event. Best-effort and batched: the row is
 * enqueued and flushed in bulk shortly after, so this never blocks the request it
 * observes (and a hard crash may drop the last unflushed batch).
 */
export async function recordAudit(e: AuditInput, transaction?: Tx): Promise<void> {
  const row = {
    eventType: e.eventType,
    actorId: e.actorId ?? null,
    tenantId: e.tenantId ?? null,
    ip: e.ip ?? null,
    userAgent: e.userAgent ?? null,
    target: e.target ?? null,
    metadata: e.metadata ?? null,
  };
  if (transaction) await transaction.insert(auditEvents).values(row);
  else auditWriter.add(row);
}
