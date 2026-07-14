// Type shape for compiled .mdx modules (see the mdx plugin in vite.config.ts).
// Post metadata lives in posts.ts, not in the .mdx files.
declare module "*.mdx" {
  import type { ComponentType, ElementType } from "react";

  const MDXContent: ComponentType<{
    components?: Record<string, ElementType>;
  }>;
  export default MDXContent;
}
