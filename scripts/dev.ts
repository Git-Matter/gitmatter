#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { $ } from "bun";

// Local dev launcher: brings up docker deps (Postgres + docling sidecar),
// applies the DB schema, then runs the app. `bun run dev` calls this.
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
async function step(label: string, run: () => Promise<unknown>): Promise<void> {
  log(flags["dry-run"] ? `(dry-run) ${label}` : label);
  if (!flags["dry-run"]) await run();
}

async function dockerIsRunning(): Promise<boolean> {
  return (await $`docker info`.quiet().nothrow()).exitCode === 0;
}

if (!flags["skip-deps"]) {
  if (!flags["dry-run"] && !(await dockerIsRunning())) {
    console.error("\x1b[31m[dev]\x1b[0m Docker is not running. Start Docker and retry.");
    process.exit(1);
  }
  // --wait blocks until Postgres is healthy (it has a healthcheck). docling
  // has no healthcheck; it is "running" immediately but loads its models on
  // first boot before it answers.
  await step(
    "starting deps (postgres + docling)",
    () =>
      $`docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait postgres docling`
  );
} else {
  log("skipping deps (--skip-deps)");
}

if (!flags["skip-migrate"]) {
  await step("applying schema", () => $`bun run migrate`.cwd("packages/db"));
} else {
  log("skipping migrate (--skip-migrate)");
}

// Launch the app via Bun.spawn (not `$`) so turbo inherits the terminal's TTY
// and renders its TUI (turbo.json sets "ui": "tui"); `$` would force stream mode.
// --cloud sets DEPLOYMENT=cloud so vite serves the marketing landing at "/"
// (vite.config.ts reads process.env.DEPLOYMENT; default is the local flavor).
log(
  flags["dry-run"]
    ? `(dry-run) starting app${flags.cloud ? " (cloud)" : ""}`
    : `starting app${flags.cloud ? " (cloud)" : ""}`
);
if (!flags["dry-run"]) {
  const proc = Bun.spawn(["bunx", "turbo", "run", "dev"], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env, ...(flags.cloud ? { DEPLOYMENT: "cloud" } : {}) },
  });
  process.exit(await proc.exited);
}
