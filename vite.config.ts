import { defineConfig } from "vite-plus";
import { configDefaults } from "vite-plus/test/config";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  test: {
    exclude: [...configDefaults.exclude, ".claude/**"],
    // Load root .env into process.env for integration tests (db, auth).
    // bun test did this implicitly; vitest does not expose non-VITE_ vars.
    setupFiles: [new URL("./vitest.setup.ts", import.meta.url).pathname],
  },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
    // Vendored shadcn/ai-elements registry components — owned but not authored
    // here. Exclude from app-strict lint instead of editing 40+ upstream files.
    // cli/ is a standalone package with its own lockfile and node_modules; the
    // root verify doesn't install its deps, so type-aware lint can't resolve its
    // ambient types. It is checked independently, not as part of the workspace.
    ignorePatterns: ["**/components/ai-elements/**", ".claude/", "scripts/", "cli/"],
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
      ".claude/",
      "coverage/",
      "pnpm-lock.yaml",
      ".pnpm-store/",
      "**/routeTree.gen.ts",
      "scripts/",
    ],
  },
});
