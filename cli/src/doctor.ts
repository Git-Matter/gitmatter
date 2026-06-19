import { $ } from "bun";
import { type Config, loadConfig, parseDbHost, paths } from "./config.ts";

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
  /** Actionable next step when `ok` is false. */
  fix?: string;
}

async function cmdOk(cmd: string[]): Promise<boolean> {
  return (await $`${cmd}`.quiet().nothrow()).exitCode === 0;
}

/** TCP connect with a timeout. Used to probe an external Postgres. */
async function tcpReachable(host: string, port: number, ms = 3000): Promise<boolean> {
  try {
    const socket = await Promise.race([
      Bun.connect({ hostname: host, port, socket: { data() {} } }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
    ]);
    socket.end();
    return true;
  } catch {
    return false;
  }
}

/**
 * Diagnose the host. Ordered cheapest-first so the first FAIL is the root cause.
 * `config` may be null before `init` has run.
 */
export async function runChecks(config: Config | null): Promise<Check[]> {
  const checks: Check[] = [];

  const hasDocker = await cmdOk(["docker", "--version"]);
  checks.push({
    name: "docker installed",
    ok: hasDocker,
    detail: hasDocker ? "found" : "not found",
    fix: hasDocker ? undefined : "Install Docker Desktop: https://docs.docker.com/get-docker/",
  });

  if (hasDocker) {
    const daemon = await cmdOk(["docker", "info"]);
    checks.push({
      name: "docker daemon running",
      ok: daemon,
      detail: daemon ? "running" : "not reachable",
      fix: daemon ? undefined : "Start Docker Desktop (or `sudo systemctl start docker`).",
    });

    const compose = await cmdOk(["docker", "compose", "version"]);
    checks.push({
      name: "docker compose plugin",
      ok: compose,
      detail: compose ? "available" : "missing",
      fix: compose ? undefined : "Update Docker Desktop, or install the compose plugin.",
    });
  }

  const configured = config !== null;
  checks.push({
    name: "config initialized",
    ok: configured,
    detail: configured ? paths.home : "not initialized",
    fix: configured ? undefined : "Run: gitmatter init",
  });

  if (config) {
    if (config.dbMode === "external") {
      const target = parseDbHost(config.databaseUrl);
      if (!target) {
        checks.push({
          name: "external database url",
          ok: false,
          detail: "DATABASE_URL is not a valid postgres URL",
          fix: "Fix DATABASE_URL via: gitmatter config set DATABASE_URL=postgres://...",
        });
      } else {
        const reachable = await tcpReachable(target.host, target.port);
        checks.push({
          name: "external database reachable",
          ok: reachable,
          detail: `${target.host}:${target.port} ${reachable ? "reachable" : "unreachable"}`,
          fix: reachable
            ? undefined
            : "Check the DB host/port/firewall. Providers: https://neon.tech, https://supabase.com",
        });
      }
    } else {
      checks.push({
        name: "database",
        ok: true,
        detail: "bundled Postgres (managed by gitmatter)",
      });
    }

    if (config.tls === "internal") {
      checks.push({
        name: "tls",
        ok: true,
        detail: `internal CA for ${config.domain} — browsers warn until the Caddy root CA is trusted`,
        fix: "Trust the root CA: docker compose exec caddy cat /data/caddy/pki/authorities/local/root.crt",
      });
    }
  }

  return checks;
}

/** Load config then run checks — the common entry used by `up` and `doctor`. */
export async function diagnose(): Promise<{ config: Config | null; checks: Check[] }> {
  const config = await loadConfig();
  return { config, checks: await runChecks(config) };
}
