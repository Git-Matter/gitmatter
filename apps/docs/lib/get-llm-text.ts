import type { InferPageType } from "fumadocs-core/source";
import type { source } from "@/lib/source";

// Public path prefix (matches next.config basePath). source baseUrl is "/", so
// page.url omits it; we prepend it here for absolute, externally-correct URLs
// in llms.txt and the copy-for-LLM output.
export const DOCS_BASE = "/docs";

export async function getLLMText(page: InferPageType<typeof source>): Promise<string> {
  // getText reads the source file, so callers must run at build time (the
  // standalone server has no content/docs). The md/llms routes are prerendered.
  const raw = await page.data.getText("raw");
  const body = raw.replace(/^---\n[\s\S]*?\n---\n*/, "");
  return `# ${page.data.title}\nURL: ${DOCS_BASE}${page.url}\n\n${body}`;
}
