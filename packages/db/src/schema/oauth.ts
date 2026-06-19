import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.js";

// OAuth 2.1 authorization-server tables. gitmatter co-hosts the AS with the
// resource server (the MCP endpoint) and reuses better-auth for the login/consent
// step. Tokens are opaque and stored hashed, like the static mcp_access_tokens.

// A registered connector. CIMD clients use their metadata-document HTTPS URL as
// client_id; DCR clients get a generated client_id. redirect_uris are validated
// exactly on /authorize.
export const oauthClients = pgTable("oauth_clients", {
  clientId: text("client_id").primaryKey(),
  clientName: text("client_name").notNull(),
  redirectUris: jsonb("redirect_uris").$type<string[]>().notNull(),
  tokenEndpointAuthMethod: text("token_endpoint_auth_method").notNull().default("none"),
  registration: text("registration").$type<"cimd" | "dcr">().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Short-lived, single-use authorization codes carrying the PKCE challenge and the
// requested resource (audience). Stored hashed.
export const oauthAuthCodes = pgTable("oauth_auth_codes", {
  codeHash: text("code_hash").primaryKey(),
  clientId: text("client_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  redirectUri: text("redirect_uri").notNull(),
  codeChallenge: text("code_challenge").notNull(),
  codeChallengeMethod: text("code_challenge_method").notNull(),
  scope: text("scope"),
  resource: text("resource"),
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Access (and rotating refresh) tokens, bound to a user and an audience (the
// MCP server address). Stored hashed; validated on every MCP request.
export const oauthAccessTokens = pgTable("oauth_access_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  refreshTokenHash: text("refresh_token_hash").unique(),
  clientId: text("client_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  scope: text("scope"),
  audience: text("audience").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at"),
});

export type OAuthClient = typeof oauthClients.$inferSelect;
export type OAuthAccessToken = typeof oauthAccessTokens.$inferSelect;
