#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

// Local dev launcher: brings up docker deps (Postgres), applies the DB schema,
// then runs the apps with Vite+. `vp run dev` calls this.
//
// Flags:
//   --skip-deps      don't touch docker (deps already running)
//   --skip-migrate   don't apply the DB schema
//   --cloud          run as the cloud flavor (serves the marketing site at "/")
//   --dry-run        print the steps without running them

const { values: flags } = parseArgs({
  options: {
    "skip-deps": { type: "boolean", default: false },
    "skip-migrate": { type: "boolean", default: false },
    cloud: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  },
});

const log = (msg: string) => console.log(`\x1b[36m[dev]\x1b[0m ${msg}`);

/** Run a command, or just print it under --dry-run. */
function step(label: string, command: string[]): void {
  log(flags["dry-run"] ? `(dry-run) ${label}` : label);
  if (!flags["dry-run"]) {
    const result = spawnSync(command[0]!, command.slice(1), { stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

function dockerIsRunning(): boolean {
  return spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
}

if (!flags["skip-deps"]) {
  if (!flags["dry-run"] && !dockerIsRunning()) {
    console.error("\x1b[31m[dev]\x1b[0m Docker is not running. Start Docker and retry.");
    process.exit(1);
  }
  // --wait blocks until Postgres is healthy (it has a healthcheck).
  step("starting deps (postgres)", ["docker", "compose", "up", "-d", "--wait", "postgres"]);
} else {
  log("skipping deps (--skip-deps)");
}

if (!flags["skip-migrate"]) {
  step("applying schema", ["vp", "run", "@workspace/db#migrate"]);
} else {
  log("skipping migrate (--skip-migrate)");
}

// Inherit the terminal and forward shutdown signals to the workspace runner.
// --cloud sets DEPLOYMENT=cloud so vite serves the marketing landing at "/"
// (vite.config.ts reads process.env.DEPLOYMENT; default is the local flavor).
log(
  flags["dry-run"]
    ? `(dry-run) starting app${flags.cloud ? " (cloud)" : ""}`
    : `starting app${flags.cloud ? " (cloud)" : ""}`
);
if (!flags["dry-run"]) {
  const child = spawn("vp", ["run", "--filter", "./apps/*", "--parallel", "dev"], {
    stdio: "inherit",
    env: { ...process.env, ...(flags.cloud ? { DEPLOYMENT: "cloud" } : {}) },
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => child.kill(signal));
  }
  child.once("error", (error) => {
    console.error(error.message);
    process.exit(1);
  });
  child.once("exit", (code) => process.exit(code ?? 1));
}
