import { FileDown, FileText } from "lucide-react";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Source, Sources, SourcesContent, SourcesTrigger } from "@/components/ai-elements/sources";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { api, type Citation } from "../../../../lib/data/api";
import { ChatEditCards } from "./ChatEditCards";
import { StepsTimeline } from "./StepsTimeline";
import { type Turn } from "./useChatSession";

function citationHref(cit: Citation): string {
  if (cit.cluster_id) return `https://www.courtlistener.com/opinion/${cit.cluster_id}/`;
  return "/documents";
}

function citationLabel(cit: Citation): string {
  if (cit.cluster_id) return `Case law (opinion ${cit.opinion_id ?? cit.cluster_id})`;
  if (cit.quotes?.length) return cit.quotes[0]!;
  return "Document";
}

/**
 * Renders a conversation's turns. User turns are a quiet bubble; assistant turns
 * open markdown on the page — the answer is the hero (DESIGN.md). When
 * `onOpenDocument` is given (matter workspace), generated-document cards open in
 * the center viewer instead of downloading.
 */
export function ChatTurns({
  turns,
  busy,
  onOpenDocument,
}: {
  turns: Turn[];
  busy: boolean;
  onOpenDocument?: (docId: string, title: string) => void;
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
              {t.steps && t.steps.length > 0 && <StepsTimeline steps={t.steps} />}
              {t.text && <MessageResponse>{t.text}</MessageResponse>}
              {t.edits && t.edits.length > 0 && <ChatEditCards edits={t.edits} />}
              {t.citations && t.citations.length > 0 && (
                <Sources>
                  <SourcesTrigger count={t.citations.length} />
                  <SourcesContent>
                    {t.citations.map((cit) => (
                      <Source key={cit.ref} href={citationHref(cit)} title={citationLabel(cit)} />
                    ))}
                  </SourcesContent>
                </Sources>
              )}
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
