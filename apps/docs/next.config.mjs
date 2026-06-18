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
};

export default withMDX(config);
