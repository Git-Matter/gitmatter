#!/usr/bin/env bun
// Dump the Postgres database to a compressed custom-format file.
//   bun scripts/db-backup.ts [outfile]
// Reads DATABASE_URL from .env. Requires `pg_dump` on PATH (postgresql-client).

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const out = process.argv[2] ?? `gitcounsel-${stamp}.dump`;

// -Fc = custom format (compressed, restorable with pg_restore). --no-owner keeps
// the dump portable across roles.
const proc = Bun.spawn(["pg_dump", url, "-Fc", "--no-owner", "-f", out], {
  stdout: "inherit",
  stderr: "inherit",
});
const code = await proc.exited;
if (code !== 0) throw new Error(`pg_dump exited ${code}`);
console.log(`Backup written to ${out}`);
