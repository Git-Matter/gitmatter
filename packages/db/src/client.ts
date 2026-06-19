import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set");
}

// Single shared connection pool, reused across dev HMR reloads via a global.
// Without the guard, every server-module reload would build a NEW postgres()
// pool and leak the previous one's open connections (idle_timeout defaults to 0
// = never closed), eventually exhausting Postgres `max_connections`.
//
// Pool tuning (postgres.js): cap connections, reclaim idle ones, recycle aged
// connections, and fail fast when the DB is unreachable. `application_name`
// makes gitmatter's connections visible in pg_stat_activity.
//
// Note: behind a transaction-mode pooler (pgBouncer/Hyperdrive) also set
// `prepare: false` — prepared statements don't survive transaction pooling. On a
// direct Postgres connection (self-host) the default (prepared) is faster.
type PgClient = ReturnType<typeof postgres>;
const POOL = Symbol.for("gitmatter.pgPool");
const g = globalThis as Record<symbol, PgClient | undefined>;
export const sql: PgClient =
  g[POOL] ??
  (g[POOL] = postgres(url, {
    max: 20,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    connect_timeout: 10,
    connection: { application_name: "gitmatter" },
  }));
export const db = drizzle(sql, { schema });

export type DB = typeof db;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

/** Connection-level failures that mean "the database is unreachable", not a bad query. */
export enum DbConnectionErrorCode {
  ConnectionRefused = "ECONNREFUSED", // nothing listening on host:port (DB down / wrong port)
  HostNotFound = "ENOTFOUND", // host does not resolve
  TimedOut = "ETIMEDOUT", // host unreachable
  ConnectionReset = "ECONNRESET", // connection dropped mid-flight
}

const CONNECTION_ERROR_CODES = new Set<string>(Object.values(DbConnectionErrorCode));

/** A network error carrying one of the connection-level `code`s above. */
export interface DbConnectionErrorLike extends Error {
  code: DbConnectionErrorCode;
}

function hasConnectionCode(err: Error): err is DbConnectionErrorLike {
  return "code" in err && typeof err.code === "string" && CONNECTION_ERROR_CODES.has(err.code);
}

/** Walk an error's `cause` chain looking for a network connection-refused style code. */
export function isDbConnectionError(err: unknown): boolean {
  let cur: unknown = err;
  while (cur instanceof Error) {
    if (hasConnectionCode(cur)) return true;
    // AggregateError (dual-stack connect) carries the real codes on `.errors`.
    if ("errors" in cur && Array.isArray(cur.errors) && cur.errors.some(isDbConnectionError)) {
      return true;
    }
    cur = "cause" in cur ? cur.cause : undefined;
  }
  return false;
}

/** Raised in place of a giant Drizzle stack when Postgres is simply unreachable. */
export class DatabaseUnavailableError extends Error {
  constructor(cause: unknown) {
    const host = (() => {
      try {
        const u = new URL(url ?? "");
        return `${u.hostname}:${u.port || "5432"}`;
      } catch {
        return "the configured host";
      }
    })();
    super(`Cannot reach Postgres at ${host}. Is the database running? (DATABASE_URL)`);
    this.name = "DatabaseUnavailableError";
    this.cause = cause;
  }
}

/**
 * Wrap a DB call so connection failures surface as a short, actionable
 * `DatabaseUnavailableError` instead of a Drizzle query dump. Real query errors
 * pass through unchanged.
 */
export async function withDb<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    if (isDbConnectionError(err)) throw new DatabaseUnavailableError(err);
    throw err;
  }
}
