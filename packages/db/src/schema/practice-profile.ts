import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";
import { user } from "./auth.js";

export const practiceProfiles = pgTable("practice_profiles", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull().default(""),
  correspondenceHeader: text("correspondence_header").notNull().default(""),
  signOff: text("sign_off").notNull().default(""),
  jurisdiction: text("jurisdiction").notNull().default("AU"),
  instructions: text("instructions").notNull().default(""),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
