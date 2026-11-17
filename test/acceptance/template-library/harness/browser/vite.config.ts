import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

const appRoot = fileURLToPath(new URL("../../../../../apps/web", import.meta.url));
const fixtureRoot = fileURLToPath(new URL(".", import.meta.url));
const fixtureRequire = createRequire(`${appRoot}/package.json`);

/** Separate entry point: no production routes, auth middleware or environment loading. */
export default defineConfig(async () => {
  const { default: react } = await import(fixtureRequire.resolve("@vitejs/plugin-react"));
  const { default: tailwind } = await import(fixtureRequire.resolve("@tailwindcss/vite"));
  return {
    root: fixtureRoot,
    cacheDir: fileURLToPath(
      new URL("../../../../../.scratch/template-design-acceptance/vite-cache/", import.meta.url)
    ),
    plugins: [react(), tailwind()],
    resolve: {
      dedupe: ["react", "react-dom"],
      alias: {
        "@": `${appRoot}/src`,
        react: `${appRoot}/node_modules/react`,
        "react-dom": `${appRoot}/node_modules/react-dom`,
        "@tanstack/react-query": `${appRoot}/node_modules/@tanstack/react-query`,
        "@tanstack/react-router": `${appRoot}/node_modules/@tanstack/react-router`,
        "@workspace/contracts": fileURLToPath(
          new URL("../../../../../packages/contracts/src/index.ts", import.meta.url)
        ),
      },
    },
    server: {
      host: "127.0.0.1",
      port: 4280,
      strictPort: true,
      proxy: { "/api": { target: "http://127.0.0.1:4295", changeOrigin: true } },
      fs: { allow: [fileURLToPath(new URL("../../../../../", import.meta.url))] },
    },
  };
});
