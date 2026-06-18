import { notFound } from "next/navigation";
import { source } from "@/lib/source";
import { getLLMText } from "@/lib/get-llm-text";

// Serves a single docs page as raw Markdown. Backs the copy-for-LLM /
// view-as-Markdown / open-in-ChatGPT page actions. Reachable at /docs/md/<slug>.
// getText reads the source .mdx, so postbuild ships content/docs into the
// standalone bundle (the server's cwd) for this to resolve at runtime.
export async function GET(_req: Request, { params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();
  return new Response(await getLLMText(page), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
