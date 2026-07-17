import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.js";

// Security/operational audit log. Distinct from the git commit spine (which
// records artifact mutations): this captures auth, key/token lifecycle, OAuth,
// invite, and object access events that the spine does not cover.

export type AuditEventType =
  | "auth.login"
  | "auth.logout"
  | "auth.failed"
  | "auth.password_reset"
  | "apikey.create"
  | "apikey.delete"
  | "mcp_token.mint"
  | "mcp_token.revoke"
  | "mcp_token.use"
  | "oauth.client_register"
  | "oauth.consent"
  | "oauth.token_refresh"
  | "invite.create"
  | "invite.accept"
  | "document.upload"
  | "document.download"
  | "document.discard_staged"
  | "storage.delete_failed"
  | "tenant.storage_region_set"
  | "tenant.privacy_evidence_export"
  | "tenant.export"
  | "matter.audit_export"
  | "budget.exceeded";

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Actor + tenant are best-effort: some events (failed login) have no user.
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    tenantId: uuid("tenant_id"),
    eventType: text("event_type").$type<AuditEventType>().notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    // Free-form target id/label (token id, document id, client id, etc.).
    target: text("target"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("audit_events_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("audit_events_actor_idx").on(t.actorId),
    index("audit_events_type_idx").on(t.eventType),
  ]
);

export type AuditEvent = typeof auditEvents.$inferSelect;
