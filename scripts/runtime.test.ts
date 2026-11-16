import { describe, expect, test } from "vite-plus/test";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

test("dev dry-run describes setup and accepts launcher flags", async () => {
  const { stdout } = await exec(process.execPath, [
    new URL("./dev.ts", import.meta.url).pathname,
    "--dry-run",
    "--cloud",
    "--skip-deps",
    "--skip-migrate",
  ]);
  expect(stdout).toContain("skipping deps");
  expect(stdout).toContain("skipping migrate");
  expect(stdout).toContain("(dry-run) starting app (cloud)");
});

test("dev stops before starting the app when migration fails", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gitmatter-dev-failure-"));
  try {
    const capture = join(directory, "args.json");
    await writeFile(
      join(directory, "vp"),
      `#!${process.execPath}\n` +
        'require("node:fs").writeFileSync(process.env.ARG_CAPTURE, JSON.stringify(process.argv.slice(2)));\n' +
        'process.exit(7);\n',
      { mode: 0o755 }
    );
    await expect(
      exec(process.execPath, [new URL("./dev.ts", import.meta.url).pathname, "--skip-deps"], {
        env: { ...process.env, PATH: directory, ARG_CAPTURE: capture },
      })
    ).rejects.toMatchObject({ code: 7 });
    expect(JSON.parse(await readFile(capture, "utf8"))).toEqual([
      "run",
      "@workspace/db#migrate",
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

describe.each([
  ["db-backup.ts", "pg_dump", "Backup written"],
  ["db-restore.ts", "pg_restore", "Restored"],
])("%s", (script, command, success) => {
  test("passes arguments without a shell and propagates failure", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gitmatter-db-script-"));
    try {
      const capture = join(directory, "args.json");
      await writeFile(
        join(directory, command),
        `#!${process.execPath}\n` +
          'require("node:fs").writeFileSync(process.env.ARG_CAPTURE, JSON.stringify(process.argv.slice(2)));\n' +
          'process.exit(Number(process.env.TOOL_EXIT || "0"));\n',
        { mode: 0o755 }
      );
      const env = {
        ...process.env,
        PATH: directory,
        DATABASE_URL: "postgres://test:test@127.0.0.1/test",
        ARG_CAPTURE: capture,
      };
      const args = [new URL(`./${script}`, import.meta.url).pathname, "backup with spaces.dump"];
      const { stdout } = await exec(process.execPath, args, { env });
      expect(stdout).toContain(success);
      expect(JSON.parse(await readFile(capture, "utf8"))).toContain("backup with spaces.dump");
      await expect(
        exec(process.execPath, args, { env: { ...env, TOOL_EXIT: "7" } })
      ).rejects.toMatchObject({ code: 1 });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
