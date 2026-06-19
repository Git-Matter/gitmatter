import { randomBytes } from "node:crypto";
import { homedir, networkInterfaces } from "node:os";
import { join } from "node:path";

/** Where all deployment state lives. Override with GITMATTER_HOME. */
export const HOME = process.env.GITMATTER_HOME ?? join(homedir(), ".gitmatter");

export const paths = {
  home: HOME,
  env: join(HOME, ".env"),
  caddyfile: join(HOME, "Caddyfile"),
  composeBase: join(HOME, "compose.yml"),
  composeDb: join(HOME, "compose.db.yml"),
};

export type DbMode = "bundled" | "external";
export type TlsMode = "internal" | "auto";

/** The settings `init` collects and writes into `.env`, mirrored back on read. */
export interface Config {
  domain: string;
  dbMode: DbMode;
  tls: TlsMode;
  databaseUrl: string;
  env: Record<string, string>;
}

const DEFAULT_BUNDLED_DB_URL = "postgres://gitmatter:gitmatter@postgres:5432/gitmatter";

/** A long random secret for BETTER_AUTH_SECRET / ENCRYPTION_KEY. */
export function secret(): string {
  return randomBytes(32).toString("hex");
}

/** Parse a `KEY=value` file into a record. Ignores blanks and `#` comments. */
export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}

/** Serialize a record back to a `KEY=value` file body. */
export function serializeEnv(env: Record<string, string>): string {
  return (
    Object.entries(env)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n"
  );
}

/** Read saved config, or null if `init` has not run. */
export async function loadConfig(): Promise<Config | null> {
  const file = Bun.file(paths.env);
  if (!(await file.exists())) return null;
  const env = parseEnv(await file.text());
  const databaseUrl = env.DATABASE_URL ?? "";
  return {
    domain: env.GITMATTER_DOMAIN ?? "gitmatter.local",
    dbMode: env.GITMATTER_DB_MODE === "external" ? "external" : "bundled",
    tls: env.GITMATTER_TLS === "auto" ? "auto" : "internal",
    databaseUrl: databaseUrl || DEFAULT_BUNDLED_DB_URL,
    env,
  };
}

/** Build the env map for a fresh install, generating secrets once. */
export function buildEnv(opts: {
  domain: string;
  dbMode: DbMode;
  tls: TlsMode;
  databaseUrl?: string;
  courtlistenerToken?: string;
}): Record<string, string> {
  const scheme = opts.tls === "auto" || opts.tls === "internal" ? "https" : "http";
  const databaseUrl = opts.dbMode === "bundled" ? DEFAULT_BUNDLED_DB_URL : (opts.databaseUrl ?? "");
  return {
    GITMATTER_DOMAIN: opts.domain,
    GITMATTER_DB_MODE: opts.dbMode,
    GITMATTER_TLS: opts.tls,
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: secret(),
    BETTER_AUTH_URL: `${scheme}://${opts.domain}`,
    ENCRYPTION_KEY: secret(),
    COURTLISTENER_API_TOKEN: opts.courtlistenerToken ?? "",
  };
}

/** First non-internal IPv4 address — the LAN address to hand out as a fallback. */
export function lanIp(): string | null {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal) return a.address;
    }
  }
  return null;
}

/** Host + port to probe for an external DATABASE_URL. */
export function parseDbHost(url: string): { host: string; port: number } | null {
  try {
    const u = new URL(url);
    return { host: u.hostname, port: Number(u.port || 5432) };
  } catch {
    return null;
  }
}
