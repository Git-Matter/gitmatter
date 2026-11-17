#!/usr/bin/env node
import "dotenv/config";
// Dump the Postgres database to a compressed custom-format file.
//   vp run db:backup [outfile]
// Reads DATABASE_URL from .env. Requires `pg_dump` on PATH (postgresql-client).

import { run } from "../cli/src/process.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const out = process.argv[2] ?? `gitmatter-${stamp}.dump`;

// -Fc = custom format (compressed, restorable with pg_restore). --no-owner keeps
// the dump portable across roles.
const code = await run(["pg_dump", url, "-Fc", "--no-owner", "-f", out], {});
if (code !== 0) throw new Error(`pg_dump exited ${code}`);
console.log(`Backup written to ${out}`);
