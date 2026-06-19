import { boolean, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.js";

// Encrypted bring-your-own provider keys (AES-256-GCM).
export const userApiKeys = pgTable(
  "user_api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").default("anthropic").notNull(),
    encrypted: text("encrypted").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [unique("user_api_key_unique").on(t.userId, t.provider)]
);

// Bearer tokens that let Claude Desktop / CLI / Cowork drive gitmatter via the
// exposed MCP server. The token maps to a gitmatter user; only the hash is stored.
export const mcpAccessTokens = pgTable("mcp_access_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  label: text("label").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),
});

// External MCP servers gitmatter consumes (e.g. CourtListener).
export const mcpConnections = pgTable("mcp_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  // null = system/global connection (shared by all users).
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  // Links this connection to a registry provider (e.g. "courtlistener").
  providerId: text("provider_id"),
  name: text("name").notNull(),
  transport: text("transport").default("http").notNull(),
  url: text("url").notNull(),
  authType: text("auth_type").$type<"none" | "bearer" | "header">().default("none").notNull(),
  // Encrypted credential blob ({encrypted, iv, authTag}) for bearer/header auth.
  authEncrypted: text("auth_encrypted"),
  authHeaderName: text("auth_header_name"),
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type UserApiKey = typeof userApiKeys.$inferSelect;
export type McpAccessToken = typeof mcpAccessTokens.$inferSelect;
export type McpConnection = typeof mcpConnections.$inferSelect;
