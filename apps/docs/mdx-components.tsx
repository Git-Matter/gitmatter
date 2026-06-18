import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";

// Merges fumadocs' default MDX components (Cards, Callout, code blocks, headings)
// with any page-specific overrides.
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return { ...defaultMdxComponents, ...components };
}
