import { boolean, index, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.js";
import { clients } from "./clients.js";
import { tenants } from "./tenants.js";

// Per-matter access role. Ordered viewer < editor < owner; read needs viewer,
// mutate needs editor, manage-team/close needs owner (see core access guard).
export type MatterRole = "owner" | "editor" | "viewer";

// A matter is a single engagement for a client — where the legal team and all
// work live. This is the unit collaboration and access control scope to.
export const matters = pgTable(
  "matters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    matterNumber: text("matter_number").unique(),
    practiceArea: text("practice_area"),
    // Governing-law jurisdiction for the matter (registry code, e.g. "US-NY").
    jurisdiction: text("jurisdiction"),
    status: text("status").$type<"open" | "closed">().notNull().default("open"),
    leadAttorney: text("lead_attorney").references(() => user.id, { onDelete: "set null" }),
    // Adverse-party names, compared against existing clients/matters on open for a
    // lightweight conflicts check; clearance is recorded as a commit.
    adverseParties: jsonb("adverse_parties").$type<string[]>(),
    conflictCleared: boolean("conflict_cleared").default(false).notNull(),
    conflictNotes: text("conflict_notes"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    openedAt: timestamp("opened_at").defaultNow().notNull(),
    closedAt: timestamp("closed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("matters_client_idx").on(t.clientId), index("matters_tenant_idx").on(t.tenantId)]
);

export const matterMembers = pgTable(
  "matter_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matterId: uuid("matter_id")
      .notNull()
      .references(() => matters.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Default for teammates added to a matter. The matter creator is inserted
    // explicitly as "owner" (not via this default) — see matter creation.
    role: text("role").$type<MatterRole>().notNull().default("editor"),
    addedAt: timestamp("added_at").defaultNow().notNull(),
  },
  // userId index powers "list matters this user belongs to" (dashboard, guard).
  (t) => [
    unique("matter_member_unique").on(t.matterId, t.userId),
    index("matter_members_user_idx").on(t.userId),
  ]
);

export type Matter = typeof matters.$inferSelect;
export type MatterMember = typeof matterMembers.$inferSelect;
