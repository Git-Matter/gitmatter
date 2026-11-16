#!/usr/bin/env node
import "dotenv/config";
import { parseArgs } from "node:util";
import { run } from "../cli/src/process.ts";

// Local dev launcher: brings up docker deps (Postgres), applies the DB schema,
// then runs the app. `vp run dev` calls this.
//
// Flags:
//   --skip-deps      don't touch docker (deps already running)
//   --skip-migrate   don't apply the DB schema
//   --cloud          run with cloud deployment settings
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
async function step(label: string, action: () => Promise<number>): Promise<void> {
  log(flags["dry-run"] ? `(dry-run) ${label}` : label);
  if (flags["dry-run"]) return;
  const code = await action();
  if (code !== 0) process.exit(code);
}

async function dockerIsRunning(): Promise<boolean> {
  return (await run(["docker", "info"], { stdio: "ignore" }).catch(() => 1)) === 0;
}

if (!flags["skip-deps"]) {
  if (!flags["dry-run"] && !(await dockerIsRunning())) {
    console.error("\x1b[31m[dev]\x1b[0m Docker is not running. Start Docker and retry.");
    process.exit(1);
  }
  // --wait blocks until Postgres is healthy (it has a healthcheck).
  await step("starting deps (postgres)", () => run(["docker", "compose", "up", "-d", "--wait", "postgres"]));
} else {
  log("skipping deps (--skip-deps)");
}

if (!flags["skip-migrate"]) {
  await step("applying schema", () => run(["vp", "run", "@workspace/db#migrate"]));
} else {
  log("skipping migrate (--skip-migrate)");
}

// Run only the web app; docs have a separate development command.
// --cloud sets DEPLOYMENT=cloud for the cloud build and runtime configuration
// (vite.config.ts reads process.env.DEPLOYMENT; default is the local flavor).
log(
  flags["dry-run"]
    ? `(dry-run) starting app${flags.cloud ? " (cloud)" : ""}`
    : `starting app${flags.cloud ? " (cloud)" : ""}`
);
if (!flags["dry-run"]) {
  const code = await run(["vp", "run", "web#dev"], {
    env: { ...process.env, ...(flags.cloud ? { DEPLOYMENT: "cloud" } : {}) },
  });
  process.exit(code);
}
