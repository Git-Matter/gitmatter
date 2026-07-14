import type { ComponentType, ElementType } from "react";

// Lazy loaders for compiled MDX post bodies. Kept apart from posts.ts so the
// .mdx modules are ONLY ever dynamically imported — this file must never be
// imported from a route file, or the bodies land in the main bundle.
// (posts.ts, which routes do import, is plain metadata.)

export type PostBody = ComponentType<{
  components?: Record<string, ElementType>;
}>;

const bodyModules = import.meta.glob<{ default: PostBody }>("./posts/*.mdx");

/** Lazy import of a post's compiled MDX body. Marketing-chunk only. */
export function loadPostBody(slug: string) {
  const load = bodyModules[`./posts/${slug}.mdx`];
  if (!load) throw new Error(`Unknown blog post: ${slug}`);
  return load;
}
