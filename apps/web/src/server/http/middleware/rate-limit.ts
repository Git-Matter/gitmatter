import type { Context, MiddlewareHandler } from "hono";
import { logEvent } from "@workspace/core";
import { clientMeta } from "../lib/request-meta.js";

// In-memory fixed-window rate limiter. One counter per (bucket, key) that resets
// at the end of each window.
//
// Best-effort and PER-PROCESS: behind N app instances the effective limit is N×
// the configured value, because each process keeps its own counters. For a single
// global limit, back this with a shared store (Redis). This is a first abuse guard
// for the public OAuth + MCP endpoints, not a billing-grade quota.

type Counter = { count: number; resetAt: number };

// One store shared by all limiters, kept on a global so a dev HMR reload reuses it
// (a fresh Map each reload would reset every window). Lazily swept + size-capped so
// a flood of distinct keys (spoofed IPs, random tokens) can't grow it unbounded.
const STORE = Symbol.for("gitmatter.rateLimit");
const g = globalThis as Record<symbol, Map<string, Counter> | undefined>;
const store: Map<string, Counter> = (g[STORE] ??= new Map());
const MAX_KEYS = 50_000;

function hit(key: string, limit: number, windowMs: number, now: number) {
  const cur = store.get(key);
  if (!cur || cur.resetAt <= now) {
    // Starting a fresh window is the natural moment to drop expired counters.
    if (store.size > MAX_KEYS) {
      for (const [k, v] of store) if (v.resetAt <= now) store.delete(k);
    }
    const fresh = { count: 1, resetAt: now + windowMs };
    store.set(key, fresh);
    return { ok: true, remaining: limit - 1, resetAt: fresh.resetAt };
  }
  cur.count += 1;
  return {
    ok: cur.count <= limit,
    remaining: Math.max(0, limit - cur.count),
    resetAt: cur.resetAt,
  };
}

/**
 * Build a rate-limit middleware. `limit <= 0` disables the limiter (pass-through),
 * so an env knob set to 0 turns it off. Emits standard `RateLimit-*` headers and
 * replies 429 with `Retry-After` once the window's budget is spent.
 */
export function rateLimit(opts: {
  name: string;
  limit: number;
  windowMs: number;
  key: (c: Context) => string;
}): MiddlewareHandler {
  return async (c, next) => {
    if (opts.limit <= 0) return next();
    const now = Date.now();
    const k = `${opts.name}:${opts.key(c)}`;
    const r = hit(k, opts.limit, opts.windowMs, now);
    const resetSec = Math.ceil((r.resetAt - now) / 1000);
    c.header("RateLimit-Limit", String(opts.limit));
    c.header("RateLimit-Remaining", String(r.remaining));
    c.header("RateLimit-Reset", String(resetSec));
    if (!r.ok) {
      c.header("Retry-After", String(resetSec));
      logEvent("warn", "rate_limit.block", { name: opts.name, key: opts.key(c) });
      return c.json({ error: "rate_limited" }, 429);
    }
    return next();
  };
}

/**
 * Key by trusted client IP. Falls back to a single shared bucket when no trusted
 * IP is available (TRUST_PROXY unset / no forwarded header) — coarse, but still
 * caps the endpoint's total rate rather than leaving it wide open.
 */
export function ipKey(c: Context): string {
  return clientMeta(c).ip ?? "shared";
}

/**
 * Key by bearer token when present, else by IP. Used for /api/mcp, where requests
 * carry a token: this limits per connection rather than lumping every client on
 * one shared IP bucket. Only a short token prefix is used as the key — enough to
 * separate callers, without holding full secrets in memory.
 */
export function tokenOrIpKey(c: Context): string {
  const m = (c.req.header("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  if (m) return `t:${m[1]!.trim().slice(0, 16)}`;
  return `ip:${clientMeta(c).ip ?? "shared"}`;
}
