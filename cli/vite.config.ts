import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/main.ts"],
    outDir: "dist",
    dts: false,
    minify: true,
    exe: {
      fileName: "gitmatter",
      outDir: "dist",
      ...(process.env.GITMATTER_CLI_RELEASE === "1"
        ? {
            targets: [
              { platform: "darwin", arch: "arm64", nodeVersion: "26.13.0" },
              { platform: "darwin", arch: "x64", nodeVersion: "26.13.0" },
              { platform: "linux", arch: "x64", nodeVersion: "26.13.0" },
              { platform: "win", arch: "x64", nodeVersion: "26.13.0" },
            ],
          }
        : {}),
    },
  },
});
