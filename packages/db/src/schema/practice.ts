import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.js";

// A user's reusable list of practice areas, picked when creating workflows and
// matters. Seeded from a default set on first use; users add their own. Scoped
// per user (like hidden_workflows), not per tenant.
export const practiceAreas = pgTable(
  "practice_areas",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique("practice_area_user_name_unique").on(t.userId, t.name)]
);

export type PracticeArea = typeof practiceAreas.$inferSelect;
