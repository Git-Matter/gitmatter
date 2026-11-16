#!/usr/bin/env node
import { spawnSync } from "node:child_process";
// Restore a custom-format dump (from db-backup.ts) into DATABASE_URL.
//   vp run db:restore <dumpfile>
// DESTRUCTIVE: --clean drops existing objects before recreating them. Point
// DATABASE_URL at the target DB (ideally a scratch DB for a restore drill).
// Requires `pg_restore` on PATH (postgresql-client).

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

const file = process.argv[2];
if (!file) throw new Error("usage: vp run db:restore <dumpfile>");

const proc = spawnSync(
  "pg_restore",
  ["--clean", "--if-exists", "--no-owner", "-d", url, file],
  { stdio: "inherit" }
);
if (proc.error) throw proc.error;
const code = proc.status;
if (code !== 0) throw new Error(`pg_restore exited ${code}`);
console.log(`Restored ${file} into the target database`);
