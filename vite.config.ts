import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  test: {
    // Load root .env into process.env for integration tests (db, auth).
    // bun test did this implicitly; vitest does not expose non-VITE_ vars.
    setupFiles: [new URL("./vitest.setup.ts", import.meta.url).pathname],
  },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  fmt: {
    endOfLine: "lf",
    semi: true,
    singleQuote: false,
    tabWidth: 2,
    trailingComma: "es5",
    printWidth: 100,
    sortTailwindcss: {
      stylesheet: "apps/web/src/styles/globals.css",
      functions: ["cn", "cva"],
    },
    sortPackageJson: false,
    ignorePatterns: [
      "dist/",
      "node_modules/",
      ".turbo/",
      ".output/",
      ".nitro/",
      ".tanstack/",
      ".vinxi/",
      "coverage/",
      "pnpm-lock.yaml",
      ".pnpm-store/",
    ],
  },
});
