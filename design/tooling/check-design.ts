import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { relative, resolve } from "node:path";
import { checkDesignTokens, type DesignTokens, tokenSource } from "./design-tokens";
import { contrastRatio, inspectDesignSource, type DesignFinding } from "./design-policy";

type Policy = {
  version: number;
  sourceRoot: string;
  excludedDirectories: string[];
  excludedFiles: string[];
  rules: Record<string, string>;
  contrastPairs: { foreground: string; background: string; minimum: number }[];
  exceptions: { file: string; rule: string; reason: string; evidence: string }[];
};
const root = fileURLToPath(new URL("../../", import.meta.url));
const policy = JSON.parse(
  await readFile(new URL("../policy.json", import.meta.url), "utf8")
) as Policy;
const tokens = JSON.parse(await readFile(tokenSource, "utf8")) as DesignTokens;
if (policy.version !== 1) throw new Error("Unsupported design policy version");
const findings: DesignFinding[] = [];
const usedExceptions = new Set<number>();
let scanned = 0;

async function scan(directory: string): Promise<void> {
  for (const item of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  )) {
    const path = resolve(directory, item.name);
    const local = relative(resolve(root, policy.sourceRoot), path).replaceAll("\\", "/");
    if (item.isDirectory()) {
      if (!policy.excludedDirectories.includes(local)) await scan(path);
    } else if (/\.(ts|tsx)$/.test(item.name) && !policy.excludedFiles.includes(local)) {
      scanned++;
      for (const finding of inspectDesignSource(
        await readFile(path, "utf8"),
        `${policy.sourceRoot}/${local}`
      )) {
        const index = policy.exceptions.findIndex(
          (entry) => entry.file === finding.file && entry.rule === finding.rule
        );
        if (index >= 0) usedExceptions.add(index);
        else findings.push(finding);
      }
    }
  }
}

for (const entry of policy.exceptions) {
  if (
    !policy.rules[entry.rule] ||
    entry.reason.trim().length < 30 ||
    !entry.evidence.trim() ||
    entry.file.includes("*")
  )
    throw new Error(
      "Design exceptions require an exact file, known rule, specific reason and evidence"
    );
}
await scan(resolve(root, policy.sourceRoot));
if (!(await checkDesignTokens()))
  findings.push({
    rule: "DG008",
    file: "apps/web/src/styles/tokens.css",
    line: 1,
    message: "Generated output differs; run vp run design:generate.",
  });
for (const [theme, values] of Object.entries(tokens.themes)) {
  for (const pair of policy.contrastPairs) {
    const ratio = contrastRatio(values[pair.foreground], values[pair.background]);
    if (ratio < pair.minimum)
      findings.push({
        rule: "DG009",
        file: "design/tokens.json",
        line: 1,
        message: `${theme} ${pair.foreground} on ${pair.background}: ${ratio.toFixed(2)} < ${pair.minimum}`,
      });
  }
}
policy.exceptions.forEach((entry, index) => {
  if (!usedExceptions.has(index))
    findings.push({
      rule: entry.rule,
      file: entry.file,
      line: 1,
      message: "Remove the stale design exception.",
    });
});
for (const finding of findings)
  console.error(`${finding.file}:${finding.line} [${finding.rule}] ${finding.message}`);
console.log(
  `Design policy: ${scanned} authored source files, ${policy.contrastPairs.length * 2} theme contrast pairs, ${findings.length} failures.`
);
if (findings.length) process.exitCode = 1;
