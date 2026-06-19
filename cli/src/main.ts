#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { $ } from "bun";
import {
  buildEnv,
  type Config,
  type DbMode,
  lanIp,
  loadConfig,
  parseEnv,
  paths,
  serializeEnv,
  type TlsMode,
} from "./config.ts";
import { diagnose, runChecks } from "./doctor.ts";
import { COMPOSE_BASE, COMPOSE_DB, renderCaddyfile } from "./templates.ts";

const C = { cyan: "\x1b[36m", red: "\x1b[31m", green: "\x1b[32m", dim: "\x1b[2m", off: "\x1b[0m" };
const log = (m: string) => console.log(`${C.cyan}[gitmatter]${C.off} ${m}`);
const err = (m: string) => console.error(`${C.red}[gitmatter]${C.off} ${m}`);

/** The `-f base [-f db]` argument list compose needs for this config. */
function composeFiles(config: Config): string[] {
  const files = ["-f", paths.composeBase];
  if (config.dbMode === "bundled") files.push("-f", paths.composeDb);
  return files;
}

/** Run `docker compose --env-file … <args>` for the active config, inheriting the TTY. */
async function compose(config: Config, args: string[]): Promise<number> {
  const full = ["docker", "compose", ...composeFiles(config), "--env-file", paths.env, ...args];
  const proc = Bun.spawn(full, { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  return proc.exited;
}

/** Abort with a message + exit 1. */
function fail(msg: string, json: boolean): never {
  if (json) console.log(JSON.stringify({ ok: false, error: msg }));
  else err(msg);
  process.exit(1);
}

async function requireConfig(json: boolean): Promise<Config> {
  const config = await loadConfig();
  if (!config) fail("Not initialized. Run: gitmatter init", json);
  return config;
}

/** Print the URLs the user/agent should hand out. */
function printUrls(config: Config): void {
  // Caddy terminates TLS for both modes, so the public URL is always https.
  log(`Web UI: ${C.green}https://${config.domain}${C.off}`);
  const ip = lanIp();
  if (ip)
    log(`LAN fallback (always works): ${C.green}https://${ip}${C.off} ${C.dim}(or http)${C.off}`);
  if (config.tls === "internal") {
    log(
      `${C.dim}First visit warns until the Caddy root CA is trusted — run \`gitmatter doctor\` for the step.${C.off}`
    );
  }
}

// ── init ────────────────────────────────────────────────────────────────────

async function cmdInit(flags: Record<string, unknown>): Promise<void> {
  const interactive = !flags.yes && process.stdin.isTTY;
  const existing = await loadConfig();

  // Defaults: re-use prior answers when re-initializing, else sane defaults.
  let domain = (flags.domain as string) ?? existing?.domain ?? "gitmatter.local";
  let dbMode: DbMode = (flags["db"] as DbMode) ?? existing?.dbMode ?? "bundled";
  let databaseUrl = (flags["database-url"] as string) ?? existing?.databaseUrl ?? "";

  if (interactive) {
    domain = prompt(`Domain to serve on?`, domain) ?? domain;
    const dbAns =
      prompt(
        `Database — "bundled" (Postgres in Docker) or "external" (your DATABASE_URL)?`,
        dbMode
      ) ?? dbMode;
    dbMode = dbAns === "external" ? "external" : "bundled";
    if (dbMode === "external") {
      databaseUrl =
        prompt(`DATABASE_URL (providers: neon.tech, supabase.com)?`, databaseUrl) ?? databaseUrl;
    }
  }

  if (dbMode === "external" && !databaseUrl) {
    fail("External database selected but no DATABASE_URL given (--database-url=…).", false);
  }

  // .local / bare hostnames can't get a public ACME cert -> internal CA.
  // A dotted public domain can -> automatic real cert.
  const tls: TlsMode =
    (flags.tls as TlsMode) ??
    (domain.endsWith(".local") || !domain.includes(".") ? "internal" : "auto");

  // Preserve any extra keys the user added (LLM keys, S3, …) across re-init.
  const env = {
    ...existing?.env,
    ...buildEnv({ domain, dbMode, tls, databaseUrl }),
  };
  // Keep generated secrets stable across re-init.
  if (existing?.env.BETTER_AUTH_SECRET) env.BETTER_AUTH_SECRET = existing.env.BETTER_AUTH_SECRET;
  if (existing?.env.ENCRYPTION_KEY) env.ENCRYPTION_KEY = existing.env.ENCRYPTION_KEY;

  await $`mkdir -p ${paths.home}`.quiet();
  await Bun.write(paths.env, serializeEnv(env));
  await Bun.write(paths.composeBase, COMPOSE_BASE);
  await Bun.write(paths.composeDb, COMPOSE_DB);
  await Bun.write(paths.caddyfile, renderCaddyfile(domain, tls));

  log(`Wrote config to ${C.green}${paths.home}${C.off}`);
  log(`  domain   ${domain}`);
  log(`  database ${dbMode}${dbMode === "external" ? ` (${databaseUrl})` : ""}`);
  log(`  tls      ${tls}`);
  log(`Next: ${C.green}gitmatter up${C.off}`);
}

// ── up / down / logs / update ────────────────────────────────────────────────

async function cmdUp(json: boolean): Promise<void> {
  const config = await requireConfig(json);

  // Gate on Docker only — config is already known good.
  const checks = (await runChecks(config)).filter((c) => c.name.startsWith("docker"));
  const blocked = checks.find((c) => !c.ok);
  if (blocked) fail(`${blocked.detail}. ${blocked.fix ?? ""}`.trim(), json);

  log("Starting stack (this pulls images on first run)…");
  const code = await compose(config, ["up", "-d", "--wait"]);
  if (code !== 0) fail("docker compose failed. Run: gitmatter logs", json);

  if (json) {
    console.log(
      JSON.stringify({
        ok: true,
        domain: config.domain,
        url: `https://${config.domain}`,
        lanFallback: lanIp() ? `https://${lanIp()}` : null,
      })
    );
    return;
  }
  log(`${C.green}Up.${C.off}`);
  printUrls(config);
}

async function cmdDown(json: boolean): Promise<void> {
  const config = await requireConfig(json);
  const code = await compose(config, ["down"]);
  if (json) console.log(JSON.stringify({ ok: code === 0 }));
  process.exit(code);
}

async function cmdLogs(args: string[]): Promise<void> {
  const config = await requireConfig(false);
  process.exit(await compose(config, ["logs", "-f", "--tail", "200", ...args]));
}

async function cmdUpdate(json: boolean): Promise<void> {
  const config = await requireConfig(json);
  log("Pulling latest images…");
  if ((await compose(config, ["pull"])) !== 0) fail("pull failed", json);
  log("Restarting…");
  const code = await compose(config, ["up", "-d", "--wait"]);
  if (json) console.log(JSON.stringify({ ok: code === 0 }));
  else if (code === 0) log(`${C.green}Updated.${C.off}`);
  process.exit(code);
}

// ── doctor ───────────────────────────────────────────────────────────────────

async function cmdDoctor(json: boolean): Promise<void> {
  const { checks } = await diagnose();
  if (json) {
    console.log(JSON.stringify({ ok: checks.every((c) => c.ok), checks }));
    process.exit(checks.every((c) => c.ok) ? 0 : 1);
  }
  let allOk = true;
  for (const c of checks) {
    const mark = c.ok ? `${C.green}PASS${C.off}` : `${C.red}FAIL${C.off}`;
    console.log(`${mark}  ${c.name} ${C.dim}— ${c.detail}${C.off}`);
    if (!c.ok && c.fix) console.log(`      ${C.cyan}fix:${C.off} ${c.fix}`);
    if (!c.ok) allOk = false;
  }
  process.exit(allOk ? 0 : 1);
}

// ── config get/set ───────────────────────────────────────────────────────────

async function cmdConfig(args: string[], json: boolean): Promise<void> {
  const config = await requireConfig(json);
  const [action, kv] = args;

  if (!action || action === "get") {
    if (json) console.log(JSON.stringify(config.env));
    else for (const [k, v] of Object.entries(config.env)) console.log(`${k}=${v}`);
    return;
  }
  if (action === "set" && kv?.includes("=")) {
    const eq = kv.indexOf("=");
    const key = kv.slice(0, eq);
    const val = kv.slice(eq + 1);
    const env = parseEnv(await Bun.file(paths.env).text());
    env[key] = val;
    await Bun.write(paths.env, serializeEnv(env));
    log(`Set ${key}. Re-run \`gitmatter up\` to apply.`);
    return;
  }
  fail("Usage: gitmatter config get | gitmatter config set KEY=value", json);
}

// ── dispatch ─────────────────────────────────────────────────────────────────

const HELP = `gitmatter — self-host the stack with Docker.

Usage:
  gitmatter init [--domain D] [--db bundled|external] [--database-url URL] [--tls internal|auto] [--yes]
  gitmatter up                 Start everything, print the URL
  gitmatter down               Stop everything
  gitmatter doctor             Diagnose host + config, print fixes
  gitmatter logs [service]     Tail logs
  gitmatter update             Pull newer images and restart
  gitmatter config get|set KEY=value

Global:
  --json   Machine-readable output (for scripts / AI agents)
  --help   This help

One prerequisite: Docker. Everything else is handled here. State lives in ${paths.home}.`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    allowPositionals: true,
    strict: false,
    options: {
      json: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
      yes: { type: "boolean", default: false },
      domain: { type: "string" },
      db: { type: "string" },
      "database-url": { type: "string" },
      tls: { type: "string" },
    },
  });

  const json = Boolean(values.json);
  const cmd = positionals[0];
  if (values.help || !cmd || cmd === "help") {
    console.log(HELP);
    return;
  }

  switch (cmd) {
    case "init":
      return cmdInit(values);
    case "up":
      return cmdUp(json);
    case "down":
      return cmdDown(json);
    case "doctor":
      return cmdDoctor(json);
    case "logs":
      return cmdLogs(positionals.slice(1));
    case "update":
      return cmdUpdate(json);
    case "config":
      return cmdConfig(positionals.slice(1), json);
    default:
      fail(`Unknown command: ${cmd}. Run \`gitmatter --help\`.`, json);
  }
}

await main();
