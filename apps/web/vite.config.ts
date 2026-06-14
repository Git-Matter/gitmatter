import { config as loadEnv } from "dotenv";
import { defineConfig } from "vite-plus";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";

// Load monorepo-root .env into process.env so server handlers (db, auth) see it.
loadEnv({ path: "../../.env" });

// Avoid 3000 (the default every other dev app grabs). Configurable via PORT;
// strictPort is off so a busy port falls through to the next free one.
const port = Number(process.env.PORT) || 4280;

// DEPLOYMENT=cloud ships the public marketing landing at "/"; anything else
// (local/self-host) drops it and "/" redirects to login. Exposed as a build
// constant so the cloud-only marketing chunk tree-shakes out of local builds.
const deployment = process.env.DEPLOYMENT === "cloud" ? "cloud" : "local";

const config = defineConfig({
  define: {
    "import.meta.env.VITE_DEPLOYMENT": JSON.stringify(deployment),
  },
  // Vite DevTools (build-mode analysis: module graph, bundle, tree-shaking).
  // Off by default — it serves an interactive UI and blocks the build. Opt in
  // with ANALYZE=1 vp build. Experimental; needs @vitejs/devtools.
  devtools: !!process.env.ANALYZE,
  resolve: { tsconfigPaths: true },
  server: { port, strictPort: false },
  preview: { port, strictPort: false },
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart({ router: { autoCodeSplitting: true } }),
    viteReact(),
    // React Compiler: plugin-react v6 dropped inline Babel, so run it via
    // @rolldown/plugin-babel. Must come after viteReact().
    babel({ presets: [reactCompilerPreset()] }),
  ],
});

export default config;
