import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth.js";
import { matters } from "./matters.js";
import { tenants } from "./tenants.js";
import type { ArtifactType } from "./commits.js";

export const chats = pgTable(
  "chats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    matterId: uuid("matter_id").references(() => matters.id, { onDelete: "cascade" }),
    // Persist the conversation's explicit legal context across follow-ups and
    // reloads; null preserves legacy fallback to matter/user preferences.
    jurisdiction: text("jurisdiction"),
    // Optionally scoped to an artifact (review/contract); null = global chat.
    artifactType: text("artifact_type").$type<ArtifactType>(),
    artifactId: uuid("artifact_id"),
    title: text("title"),
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("chats_tenant_idx").on(t.tenantId)]
);

// Append-only conversation log. NOT part of the commit spine.
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    actorType: text("actor_type").$type<"user" | "agent" | "tool">().notNull(),
    actorId: text("actor_id"),
    role: text("role").$type<"user" | "assistant">().notNull(),
    content: jsonb("content").notNull(),
    annotations: jsonb("annotations"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique("chat_message_seq_unique").on(t.chatId, t.seq)]
);

export type Chat = typeof chats.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
