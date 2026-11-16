import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type { DesignFinding } from "./design-policy";

/** Origin needs source review; this check detects unreviewed additions and asset drift. */
export async function checkProductMedia(root: string): Promise<DesignFinding[]> {
  const manifest = JSON.parse(await readFile(resolve(root, "design/media.json"), "utf8")) as {
    version: number;
    assets: Record<string, { kind: string; composition: string; source: string; sha256: string }>;
  };
  if (manifest.version !== 1) throw new Error("Unsupported media registry version");
  const findings: DesignFinding[] = [];
  const add = (message: string) =>
    findings.push({ rule: "DG010", file: "design/media.json", line: 1, message });
  const publicRoot = resolve(root, "apps/web/public");
  const files: string[] = [];
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.endsWith(".mp4"))
        files.push(`/${relative(publicRoot, path).replaceAll("\\", "/")}`);
    }
  }
  await walk(publicRoot);
  const compositions = await readFile(resolve(root, "apps/video/src/Root.tsx"), "utf8");
  for (const src of files.sort()) {
    const asset = manifest.assets[src];
    if (!asset) {
      add(`Register and review the origin of ${src}.`);
      continue;
    }
    if (
      asset.kind !== "illustration" ||
      !/^[A-Za-z]\w*$/.test(asset.composition) ||
      !/^apps\/video\/src\/[\w/-]+\.tsx$/.test(asset.source) ||
      !/^[a-f0-9]{64}$/.test(asset.sha256)
    ) {
      add(`Invalid reviewed illustration metadata: ${src}.`);
      continue;
    }
    if (
      !compositions.includes(`id: "${asset.composition}"`) &&
      !compositions.includes(`id="${asset.composition}"`)
    )
      add(`Composition is not registered in Root.tsx: ${asset.composition}.`);
    if (!(await stat(resolve(root, asset.source)).catch(() => null))?.isFile())
      add(`Missing illustration source: ${asset.source}.`);
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(resolve(publicRoot, src.slice(1))))
      hash.update(chunk);
    if (hash.digest("hex") !== asset.sha256)
      add(`Media changed; review the asset and its origin before updating its hash: ${src}.`);
  }
  for (const src of Object.keys(manifest.assets))
    if (!files.includes(src)) add(`Remove the missing/stale media entry: ${src}.`);
  return findings;
}
