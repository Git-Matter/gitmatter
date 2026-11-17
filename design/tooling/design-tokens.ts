import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

type Declarations = Record<string, string>;
export type DesignTokens = {
  version: number;
  description: string;
  shared: Declarations;
  utilities: Declarations;
  themes: { light: Declarations; dark: Declarations };
  recipes: Record<string, Declarations>;
};

export const tokenSource = new URL("../tokens.json", import.meta.url);
export const tokenOutput = new URL("../../apps/web/src/styles/tokens.css", import.meta.url);

function entries(values: Declarations): [string, string][] {
  return Object.entries(values).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

function block(selector: string, values: Declarations): string {
  return `${selector} {\n${entries(values)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join("\n")}\n}\n`;
}

export function renderDesignTokens(tokens: DesignTokens): string {
  if (tokens.version !== 1) throw new Error("Unsupported design token format version");
  const light = Object.keys(tokens.themes.light).sort().join(",");
  const dark = Object.keys(tokens.themes.dark).sort().join(",");
  if (light !== dark) throw new Error("Every theme must define the same semantic roles");
  for (const values of [
    tokens.shared,
    tokens.utilities,
    tokens.themes.light,
    tokens.themes.dark,
    ...Object.values(tokens.recipes),
  ]) {
    for (const [name, value] of entries(values)) {
      if (!/^[-a-z][\w-]*$/.test(name) || typeof value !== "string" || /[{};]/.test(value))
        throw new Error(`Invalid CSS token declaration: ${name}`);
    }
  }
  const recipes = Object.entries(tokens.recipes).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  if (recipes.some(([name]) => !/^[a-z][\w-]*$/.test(name))) throw new Error("Invalid recipe name");
  return [
    "/* Generated from design/tokens.json by vp run design:generate. Do not edit by hand. */\n",
    block("@theme inline", tokens.utilities),
    block(":root", { ...tokens.shared, ...tokens.themes.light }),
    block(".dark", tokens.themes.dark),
    ...recipes.map(([name, values]) => block(`@utility ${name}`, values)),
  ].join("\n");
}

export async function checkDesignTokens(): Promise<boolean> {
  const tokens = JSON.parse(await readFile(tokenSource, "utf8")) as DesignTokens;
  return (await readFile(tokenOutput, "utf8")) === renderDesignTokens(tokens);
}

async function main() {
  const tokens = JSON.parse(await readFile(tokenSource, "utf8")) as DesignTokens;
  const rendered = renderDesignTokens(tokens);
  if (process.argv.includes("--check")) {
    if (!(await checkDesignTokens()))
      throw new Error("Design token output drifted. Run vp run design:generate.");
    console.log("Design token output matches its canonical source.");
  } else {
    await writeFile(tokenOutput, rendered);
    console.log(`Generated ${fileURLToPath(tokenOutput)}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Design token generation failed");
    process.exitCode = 1;
  });
}
