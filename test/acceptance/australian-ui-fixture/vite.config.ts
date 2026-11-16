import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { defineConfig, type ViteDevServer } from "vite-plus";

const appRoot = fileURLToPath(new URL("../../../apps/web", import.meta.url));
const fixtureRoot = fileURLToPath(new URL(".", import.meta.url));
const fixtureRequire = createRequire(`${appRoot}/package.json`);

/** Separate entry point: no production routes, auth middleware or environment loading. */
export default defineConfig(async () => {
  const { default: react } = await import(fixtureRequire.resolve("@vitejs/plugin-react"));
  const { default: tailwind } = await import(fixtureRequire.resolve("@tailwindcss/vite"));
  return {
    root: fixtureRoot,
    // Keep this independent entry point's prebundled React graph separate from the app.
    cacheDir: fileURLToPath(new URL("../../../.scratch/australian-ui-vite/", import.meta.url)),
    plugins: [
      react(),
      tailwind(),
      {
        name: "block-unhandled-australian-fixture-api",
        configureServer(server: ViteDevServer) {
          server.middlewares.use((request, response, next) => {
            if (!request.url?.startsWith("/api/")) return next();
            response.statusCode = 599;
            response.end("No application backend exists in this fixture; intercept the request.");
          });
        },
      },
    ],
    resolve: {
      dedupe: ["react", "react-dom"],
      alias: {
        "@": `${appRoot}/src`,
        react: `${appRoot}/node_modules/react`,
        "react-dom": `${appRoot}/node_modules/react-dom`,
        "next-themes": `${appRoot}/node_modules/next-themes`,
        "@tanstack/react-query": `${appRoot}/node_modules/@tanstack/react-query`,
        "@tanstack/react-router": `${appRoot}/node_modules/@tanstack/react-router`,
        "@workspace/contracts": fileURLToPath(
          new URL("../../../packages/contracts/src/index.ts", import.meta.url)
        ),
        "@workspace/registry": fileURLToPath(
          new URL("../../../packages/registry/src/index.ts", import.meta.url)
        ),
      },
    },
    server: {
      host: "127.0.0.1",
      port: 4280,
      strictPort: true,
      fs: { allow: [fileURLToPath(new URL("../../../", import.meta.url))] },
    },
  };
});
