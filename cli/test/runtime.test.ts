import { afterAll, describe, expect, test } from "vite-plus/test";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const home = await mkdtemp(join(tmpdir(), "gitmatter-cli-test-"));
const main = new URL("../src/main.ts", import.meta.url).pathname;

async function cli(...args: string[]) {
  return exec(process.execPath, [main, ...args], {
    env: { ...process.env, GITMATTER_HOME: home },
  });
}

afterAll(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("Node CLI", () => {
  test("prints help without Docker or initialized state", async () => {
    expect((await cli("--help")).stdout).toContain("gitmatter init");
  });

  test("initializes deployment files, preserves state, and updates config", async () => {
    await cli("init", "--yes");
    const original = await readFile(join(home, ".env"), "utf8");
    expect(original).toContain("GITMATTER_DOMAIN=gitmatter.local");
    expect(await readFile(join(home, "compose.yml"), "utf8")).toContain(
      "vp run @workspace/db#migrate"
    );

    await cli("config", "set", "CUSTOM_SETTING=hello world");
    await cli("init", "--yes", "--domain", "other.local");
    const updated = await readFile(join(home, ".env"), "utf8");
    expect(updated).toContain("GITMATTER_DOMAIN=other.local");
    expect(updated).toContain("CUSTOM_SETTING=hello world");
    for (const line of original.split("\n")) {
      if (line.startsWith("BETTER_AUTH_SECRET=") || line.startsWith("ENCRYPTION_KEY=")) {
        expect(updated.includes(line)).toBe(true);
      }
    }
    const { stdout } = await cli("config", "get", "--json");
    expect(JSON.parse(stdout).CUSTOM_SETTING).toBe("hello world");
  });

  test("returns a failing exit status for invalid commands", async () => {
    await expect(cli("invalid-command", "--json")).rejects.toMatchObject({ code: 1 });
  });
});
