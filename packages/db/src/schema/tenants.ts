import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.js";

// A tenant is one law firm / organization. Every user belongs to exactly one
// tenant; all clients, matters and artifacts hang off a tenant, and sharing is
// restricted to users within the same tenant. The first signup creates a tenant
// (that user becomes admin); others join via an emailed invite.
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // Immutable document-storage placement. Existing tenants are migrated to
  // `legacy`; new organizations choose a region during onboarding.
  storageRegion: text("storage_region").$type<StorageRegion>(),
  // user.id of the founder. No FK: the auth.user row may be created in the same
  // flow and lives in a separate Postgres schema — avoid a cross-schema cycle.
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type TenantRole = "admin" | "member";
export type StorageRegion = "legacy" | "eu" | "us" | "au";

// Pending invitations to join a tenant. Accepted at signup when an email with a
// matching unconsumed, unexpired invite signs up.
export const tenantInvites = pgTable(
  "tenant_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    token: text("token").notNull().unique(),
    role: text("role").$type<TenantRole>().notNull().default("member"),
    invitedBy: text("invited_by").references(() => user.id, { onDelete: "set null" }),
    acceptedAt: timestamp("accepted_at"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("tenant_invites_email_idx").on(t.email),
    index("tenant_invites_tenant_idx").on(t.tenantId),
  ]
);

export type Tenant = typeof tenants.$inferSelect;
export type TenantInvite = typeof tenantInvites.$inferSelect;
