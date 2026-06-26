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

// Public, session-free pages safe to render to static HTML at build time (then
// served from the edge / CF cache). Cloud only: in a local build the marketing
// chunk is tree-shaken out and these paths redirect to /login, so there is
// nothing to prerender. Everything under _auth/* is per-session and must NOT be
// listed here.
const PUBLIC_PRERENDER_PATHS = [
  "/", // marketing home
  "/about",
  "/privacy",
  "/security",
  "/terms",
  "/login",
  "/signup",
];

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
  define: {
    "import.meta.env.VITE_DEPLOYMENT": JSON.stringify(deployment),
    // Public Turnstile site key, baked in as a build constant (safe to expose).
    // Empty when unset, which disables the widget client-side.
    "import.meta.env.VITE_TURNSTILE_SITE_KEY": JSON.stringify(process.env.TURNSTILE_SITE_KEY ?? ""),
  },
  // Vite DevTools (build-mode analysis: module graph, bundle, tree-shaking).
  // Off by default — it serves an interactive UI and blocks the build. Opt in
  // with ANALYZE=1 vp build. Experimental; needs @vitejs/devtools.
  devtools: !!process.env.ANALYZE,
  resolve: { tsconfigPaths: true },
  server: { port, strictPort: false },
  // allowedHosts: the prod/staging containers serve via `vp preview` behind
  // Traefik, which already routes by host — so accept whatever host it forwards.
  preview: { port, strictPort: false, allowedHosts: true },
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
