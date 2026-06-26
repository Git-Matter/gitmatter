import type { ReactNode } from "react";
import {
  InlineCitationCard,
  InlineCitationCardBody,
  InlineCitationCardTrigger,
  InlineCitationSource,
} from "@/components/ai-elements/inline-citation";

// A citation resolved against the turn's captured source cards: the real
// (slugged) link plus the bits the hover preview shows.
export type ResolvedCitation = {
  href: string;
  label: string;
  snippet?: string;
};

// Fenced ``` blocks and inline `code` — left untouched so an array index like
// [1] inside a code sample never becomes a citation link.
const CODE_SEGMENT = /(```[\s\S]*?```|`[^`]*`)/g;

/**
 * Turn each inline `[N]` marker whose ref we have a citation for into a
 * `[N](#cite-N)` link, in prose only. The `#cite-N` hash href survives
 * Streamdown's URL sanitization (custom schemes get stripped); the `a` override
 * below renders it as an inline citation badge.
 */
export function linkifyCitations(text: string, refs: Set<number>): string {
  if (!refs.size) return text;
  return text
    .split(CODE_SEGMENT)
    .map((segment, i) =>
      // Capturing split: odd indices are the code segments — skip them.
      i % 2 === 1
        ? segment
        : segment.replace(/\[(\d+)\]/g, (whole, digits: string) =>
            refs.has(Number(digits)) ? `[${digits}](#cite-${digits})` : whole
          )
    )
    .join("");
}

function CitationBadge({ cit }: { cit: ResolvedCitation }) {
  return (
    <InlineCitationCard>
      <InlineCitationCardTrigger href={cit.href} sources={[cit.href]} />
      <InlineCitationCardBody>
        <div className="space-y-1 p-3">
          <InlineCitationSource title={cit.label} url={cit.href} description={cit.snippet} />
        </div>
      </InlineCitationCardBody>
    </InlineCitationCard>
  );
}

/**
 * Streamdown `components` override: a `#cite-N` link renders as the inline
 * citation badge bound to citation N; every other link stays an ordinary
 * new-tab anchor.
 */
export function citationComponents(map: Map<number, ResolvedCitation>) {
  return {
    a: ({ href, children, ...props }: { href?: string; children?: ReactNode }) => {
      const match = href?.match(/^#cite-(\d+)$/);
      if (match) {
        const cit = map.get(Number(match[1]));
        return cit ? <CitationBadge cit={cit} /> : <>{children}</>;
      }
      return (
        <a href={href} target="_blank" rel="noreferrer" {...props}>
          {children}
        </a>
      );
    },
  };
}
