import { defineConfig } from "vite-plus";
import type { ExeTarget } from "@tsdown/exe";

const targets: ExeTarget[] = [
  { platform: "darwin", arch: "arm64", nodeVersion: "26.13.0" },
  { platform: "darwin", arch: "x64", nodeVersion: "26.13.0" },
  { platform: "linux", arch: "x64", nodeVersion: "26.13.0" },
  { platform: "win", arch: "x64", nodeVersion: "26.13.0" },
];

function executable(name: string, selectedTargets?: ExeTarget[]) {
  return {
    name,
    entry: ["src/main.ts"],
    outDir: "dist",
    dts: false,
    minify: true,
    exe: {
      fileName: "gitmatter",
      outDir: "dist",
      ...(selectedTargets ? { targets: selectedTargets } : {}),
    },
  };
}

export default defineConfig({
  pack: [
    executable("host"),
    executable("all", targets),
    ...targets.map((target) => executable(`${target.platform}-${target.arch}`, [target])),
  ],
});
