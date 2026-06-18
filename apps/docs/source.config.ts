import { defineConfig, defineDocs } from "fumadocs-mdx/config";

// Docs MDX lives under content/docs. The fumadocs-mdx Next plugin (next.config)
// reads this and generates the `.source` folder consumed by lib/source.ts.
export const docs = defineDocs({
  dir: "content/docs",
});

export default defineConfig();
