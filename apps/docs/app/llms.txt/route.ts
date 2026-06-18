import { llms } from "fumadocs-core/source";
import { source } from "@/lib/source";
import { DOCS_BASE } from "@/lib/get-llm-text";

// /docs/llms.txt — Markdown index of every page for LLMs. source baseUrl is "/",
// so page links omit the /docs prefix; add it for absolute, externally-correct URLs.
export const revalidate = false;

export function GET() {
  const index = llms(source).index().replaceAll("](/", `](${DOCS_BASE}/`);
  return new Response(index, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
