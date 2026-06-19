// Citations contract for in-app chat. The model appends a single machine-readable
// block at the very end of its reply; we parse it out, store it, and strip it
// from the prose the user sees. Inline [N] markers stay in the prose and map to
// the parsed entries by `ref`.

export type Citation = {
  ref: number;
  // A gitmatter document artifact the claim is grounded in.
  doc_id?: string;
  quotes?: string[];
  // A CourtListener opinion (US case law).
  cluster_id?: number;
  opinion_id?: number;
};

export const CITATIONS_INSTRUCTION = `When your answer relies on a document or a case, cite it. Put inline markers like [1], [2] in your prose, then append ONE block at the very end, on its own line:
<CITATIONS>[{"ref":1,"doc_id":"<document id>","quotes":["short supporting quote"]}, {"ref":2,"cluster_id":123,"opinion_id":456}]</CITATIONS>
Use doc_id for gitmatter documents and cluster_id/opinion_id for case law from search_case_law. Omit the block entirely if you cited nothing. Never mention the block itself.`;

// How the assistant should redline documents. Steers propose_document_edit toward
// minimal, anchored tracked changes instead of whole-paragraph rewrites.
export const REDLINE_INSTRUCTION = `DOCUMENT EDITING:
Use get_document to read the current text before editing. To change a document, call propose_document_edit — it creates tracked changes the user accepts or rejects; the document is unchanged until then.
- Pass ALL edits for a document in a SINGLE propose_document_edit call via the \`edits\` array. They commit as one version, so batching keeps the history clean — do not call the tool once per edit.
- Each edit is a precise, minimal substitution of the specific words/characters being changed, NOT a whole-line or paragraph replacement.
- Set \`find\` to the exact substring to replace (as short as possible). \`replace\` is the new text; an empty string is a pure deletion.
- Always anchor with \`contextBefore\` (~40 chars immediately before \`find\`) and \`contextAfter\` (~40 chars immediately after) so the location is unambiguous. Copy the context verbatim from get_document output.
- Give a short \`reason\` for each edit; it is shown to the user on the change card.
- When adding/deleting/moving a numbered clause, section, or list item, renumber affected downstream items and update cross-references in the same batch.
- When deleting square brackets, delete both "[" and "]".`;

const CITATIONS_RE = /<CITATIONS>([\s\S]*?)<\/CITATIONS>\s*$/;

/**
 * Split a reply into display text + parsed citations. If there's no block (or it
 * doesn't parse), returns the original text and an empty list — never throws.
 */
export function parseCitations(raw: string): { text: string; citations: Citation[] } {
  const m = raw.match(CITATIONS_RE);
  if (!m || m.index === undefined) return { text: raw, citations: [] };

  let citations: Citation[] = [];
  try {
    const parsed: unknown = JSON.parse(m[1]!.trim());
    if (Array.isArray(parsed)) {
      citations = parsed.filter(
        (c): c is Citation => !!c && typeof (c as Citation).ref === "number"
      );
    }
  } catch {
    // Malformed block — drop it but still strip it from the prose.
  }
  return { text: raw.slice(0, m.index).trimEnd(), citations };
}
