import type { QuoteCitation } from "@workspace/contracts";

/** No existing review snapshot records a trusted page map. Keep exact quotations
 * while dropping unsupported model/legacy page claims from publication or views.
 * This is a projection: it never mutates the supplied historical evidence. */
export function quoteOnlyCitations(
  citations: readonly { quote: string }[] | null | undefined
): QuoteCitation[] {
  return (citations ?? []).map(({ quote }) => ({ quote }));
}
