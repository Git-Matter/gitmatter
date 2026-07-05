import { FileDown, FileText } from "lucide-react";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { api, type Citation, type SourceCard } from "../../../../lib/data/api";
import { ChatEditCards } from "./ChatEditCards";
import { StepsTimeline } from "./StepsTimeline";
import { type Turn } from "./useChatSession";
import { citationComponents, linkifyCitations, type ResolvedCitation } from "./citation-markdown";

function cardsFromSteps(t: Turn): SourceCard[] {
  return (t.steps ?? []).flatMap((s) =>
    Array.isArray(s.detail?.sources) ? (s.detail.sources as SourceCard[]) : []
  );
}

function resolveCitation(cit: Citation, cards: SourceCard[]): ResolvedCitation {
  if (cit.cluster_id) {
    const needle = `/opinion/${cit.cluster_id}/`;
    const card = cards.find((c) => {
      if (!c.url) return false;
      try {
        return new URL(c.url, "https://www.courtlistener.com").pathname.includes(needle);
      } catch {
        return false;
      }
    });
    return {
      href: card?.url ?? `https://www.courtlistener.com/opinion/${cit.cluster_id}/`,
      label: card?.title ?? `Case law (opinion ${cit.opinion_id ?? cit.cluster_id})`,
      snippet: card?.snippet ?? cit.quotes?.[0],
    };
  }
  const card = cit.doc_id ? cards.find((c) => c.docId === cit.doc_id) : undefined;
  return {
    href: card?.url ?? "/documents",
    label: card?.title ?? cit.quotes?.[0] ?? "Document",
    snippet: card?.snippet ?? cit.quotes?.[0],
  };
}

function citationMap(t: Turn): Map<number, ResolvedCitation> {
  const cards = cardsFromSteps(t);
  const map = new Map<number, ResolvedCitation>();
  for (const cit of t.citations ?? []) map.set(cit.ref, resolveCitation(cit, cards));
  return map;
}

export function ChatTurns({
  turns,
  busy,
  onOpenDocument,
  onOpenSource,
}: {
  turns: Turn[];
  busy: boolean;
  onOpenDocument?: (docId: string, title: string) => void;
  onOpenSource?: (card: SourceCard) => void;
}) {
  return (
    <>
      {turns.map((t, i) =>
        t.role === "user" ? (
          <Message key={i} from="user">
            <MessageContent>
              <p className="whitespace-pre-wrap">{t.text}</p>
            </MessageContent>
          </Message>
        ) : (
          <Message key={i} from="assistant">
            <MessageContent>
              {/* Pre-first-token cue: model reached but nothing streamed back yet. */}
              {busy && i === turns.length - 1 && !t.text && !(t.steps && t.steps.length) && (
                <Shimmer duration={1}>Thinking…</Shimmer>
              )}
              {t.steps && t.steps.length > 0 && (
                <StepsTimeline steps={t.steps} onOpenSource={onOpenSource} />
              )}
              {t.text &&
                (() => {
                  // Citations render inline at each [N] marker (badge + hover preview),
                  // resolved to the real slugged source URL — no bottom footnote.
                  const map = citationMap(t);
                  return (
                    <MessageResponse components={citationComponents(map)}>
                      {linkifyCitations(t.text, new Set(map.keys()))}
                    </MessageResponse>
                  );
                })()}
              {t.edits && t.edits.length > 0 && <ChatEditCards edits={t.edits} />}
              {t.documents?.map((d) =>
                onOpenDocument ? (
                  <button
                    key={d.id}
                    onClick={() => onOpenDocument(d.id, d.title)}
                    className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:bg-muted/50"
                  >
                    <FileText className="size-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{d.title}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      AI draft
                    </span>
                    <span className="text-xs text-muted-foreground">Open</span>
                  </button>
                ) : (
                  <a
                    key={d.id}
                    href={api.documentDownloadUrl(d.id)}
                    className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted/50"
                  >
                    <FileDown className="size-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{d.title}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      AI draft
                    </span>
                    <span className="text-xs text-muted-foreground">Download .docx</span>
                  </a>
                )
              )}
            </MessageContent>
          </Message>
        )
      )}
    </>
  );
}
