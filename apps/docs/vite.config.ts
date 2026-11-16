import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      build: {
        command: "next build && node scripts/postbuild.mjs",
        env: ["NODE_ENV"],
        input: [
          { auto: true },
          { pattern: "docs/**", base: "workspace" },
          "!.next/**",
          "!.source/**",
          "!next-env.d.ts",
          "!tsconfig.tsbuildinfo",
        ],
        output: [".next/**", "!.next/cache/**"],
      },
    },
  },
});
