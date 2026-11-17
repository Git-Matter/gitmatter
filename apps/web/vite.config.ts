import { config as loadEnv } from "dotenv";
import { defineConfig, searchForWorkspaceRoot } from "vite-plus";
import { fileURLToPath } from "node:url";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";

// Load monorepo-root .env into process.env so server handlers (db, auth) see it.
loadEnv({ path: "../../.env" });

// Avoid 3000 (the default every other dev app grabs). Configurable via PORT.
// Reject a duplicate start rather than silently launching another instance.
const port = Number(process.env.PORT) || 4280;

// Cloud builds prerender only session-free access and legal pages. Protected
// routes resolve each visitor's session at request time.
const deployment = process.env.DEPLOYMENT === "cloud" ? "cloud" : "local";
const PUBLIC_PRERENDER_PATHS = ["/privacy", "/terms", "/login", "/signup"];

// Lock prerender to the explicit whitelist: discovery and link-crawling are off
// so the prerenderer can never wander into the authenticated app shell (which
// would render session-less or fail). `filter` is a second guard on top of the
// explicit `pages` list.
const prerenderOptions =
  deployment === "cloud"
    ? {
        prerender: {
          enabled: true,
          autoStaticPathsDiscovery: false,
          crawlLinks: false,
          failOnError: true,
          filter: ({ path }: { path: string }) => PUBLIC_PRERENDER_PATHS.includes(path),
        },
        pages: PUBLIC_PRERENDER_PATHS.map((path) => ({
          path,
          prerender: { enabled: true },
        })),
      }
    : undefined;

const config = defineConfig({
  run: {
    tasks: {
      build: {
        command: "vp build",
        env: ["DEPLOYMENT", "TURNSTILE_SITE_KEY", "NODE_ENV"],
        untrackedEnv: ["DATABASE_URL", "BETTER_AUTH_SECRET", "ENCRYPTION_KEY", "RAYON_NUM_THREADS"],
        input: [{ auto: true }, "!dist/**", "!.tanstack/**"],
        output: ["dist/**"],
      },
    },
  },
  define: {
    // Public Turnstile site key, baked in as a build constant (safe to expose).
    // Empty when unset, which disables the widget client-side.
    "import.meta.env.VITE_TURNSTILE_SITE_KEY": JSON.stringify(process.env.TURNSTILE_SITE_KEY ?? ""),
  },
  // Vite DevTools (build-mode analysis: module graph, bundle, tree-shaking).
  // Off by default — it serves an interactive UI and blocks the build. Opt in
  // with ANALYZE=1 vp build. Experimental; needs @vitejs/devtools.
  devtools: !!process.env.ANALYZE,
  resolve: { tsconfigPaths: true },
  server: {
    port,
    strictPort: true,
    // TanStack devtools already forwards console output. A second relay can
    // echo browser/server errors back into itself during HMR.
    forwardConsole: false,
    fs: {
      allow: [
        searchForWorkspaceRoot(process.cwd()),
        // pnpm can keep Fontsource assets in its global virtual store. Allow
        // only the two font package directories, never the whole store.
        ...["inter", "newsreader"].map((font) =>
          fileURLToPath(
            new URL(".", import.meta.resolve(`@fontsource-variable/${font}/package.json`))
          )
        ),
      ],
    },
  },
  // allowedHosts: the prod/staging containers serve via `vp preview` behind
  // Traefik, which already routes by host — so accept whatever host it forwards.
  preview: { port, strictPort: true, allowedHosts: true },
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart(prerenderOptions),
    viteReact(),
    // React Compiler: plugin-react v6 dropped inline Babel, so run it via
    // @rolldown/plugin-babel. Must come after viteReact().
    babel({ presets: [reactCompilerPreset()] }),
  ],
});

export default config;
