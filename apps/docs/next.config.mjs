import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Standalone server output (own toolchain, independent of the app's vite-plus
  // build). Mounted under /docs so a single reverse-proxy rule (/docs/* → this
  // app, assets included via /docs/_next) routes everything here.
  output: "standalone",
  basePath: "/docs",
  // Dev convenience: redirect bare "/" to "/docs" so the local server isn't a
  // 404 at root. Disabled in production — there the reverse proxy owns "/" and
  // routes it to the main app, so this redirect must not exist.
  async redirects() {
    if (process.env.NODE_ENV !== "development") return [];
    return [{ source: "/", destination: "/docs", basePath: false, permanent: false }];
  },
};

export default withMDX(config);
