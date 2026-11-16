import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const host = `${process.platform === "win32" ? "win" : process.platform}-${process.arch}`;
const target = process.argv[2] ?? host;
if (!["darwin-arm64", "darwin-x64", "linux-x64", "win-x64"].includes(target)) {
  throw new Error(`Unsupported CLI target: ${target}`);
}
if (Number(process.versions.node.split(".")[0]) < 26) {
  throw new Error("CLI builds require Node.js 26.13 or newer for native single executable packaging.");
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`);
}

async function download(url, expectedHash, output) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== expectedHash) {
    throw new Error(`Node archive checksum mismatch: ${url}`);
  }
  await writeFile(output, bytes);
}

const scratch = await mkdtemp(join(tmpdir(), "gitmatter-sea-"));
try {
  let executable = process.execPath;
  if (target !== host) {
    const version = process.versions.node;
    const base = `https://nodejs.org/dist/v${version}`;
    const sumsResponse = await fetch(`${base}/SHASUMS256.txt`);
    if (!sumsResponse.ok) throw new Error(`Could not read Node ${version} checksums`);
    const sums = new Map((await sumsResponse.text()).trim().split(/\r?\n/).map((line) => {
      const [hash, path] = line.trim().split(/\s+/);
      return [path, hash];
    }));
    if (target === "win-x64") {
      const filename = "win-x64/node.exe";
      const checksum = sums.get(filename);
      if (!checksum) throw new Error(`No Node checksum for ${filename}`);
      executable = join(scratch, "node.exe");
      await download(`${base}/${filename}`, checksum, executable);
    } else {
      const folder = `node-v${version}-${target}`;
      const archive = `${folder}.tar.gz`;
      const checksum = sums.get(archive);
      if (!checksum) throw new Error(`No Node checksum for ${archive}`);
      const archivePath = join(scratch, archive);
      await download(`${base}/${archive}`, checksum, archivePath);
      run("tar", ["-xzf", archivePath, "-C", scratch]);
      executable = join(scratch, folder, "bin", "node");
    }
  }
  const payload = join(scratch, "cli.cjs");
  await build({ entryPoints: [join(root, "src/main.ts")], outfile: payload, bundle: true,
    platform: "node", format: "cjs", target: "node26", minify: true });
  const filename = process.argv[2] ? `gitmatter-${target}${target.startsWith("win-") ? ".exe" : ""}` : `gitmatter${target.startsWith("win-") ? ".exe" : ""}`;
  const output = join(root, "dist", filename);
  await mkdir(dirname(output), { recursive: true });
  const config = join(scratch, "sea.json");
  await writeFile(config, JSON.stringify({ main: payload, mainFormat: "commonjs", executable, output,
    disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false, execArgvExtension: "none" }));
  run(process.execPath, ["--build-sea", config]);
  await chmod(output, 0o755);
  // Native macOS release jobs sign their executable after injection.
  if (target.startsWith("darwin-") && process.platform === "darwin") {
    run("codesign", ["--force", "--sign", "-", output]);
  }
  console.log(`Built ${output}`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
