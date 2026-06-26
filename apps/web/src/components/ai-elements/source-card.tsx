import { ExternalLink, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/util/utils";
import type { SourceCard as SourceCardData } from "@/lib/data/api";

const CARD_CLASS =
  "flex flex-col gap-1 rounded-lg border border-border bg-card p-3 text-start transition-colors hover:border-bronze hover:bg-bronze-tint/30";

function isExternal(card: SourceCardData) {
  return !card.docId && !!card.url && /^https?:/.test(card.url);
}

function SourceCardRow({
  card,
  onOpen,
}: {
  card: SourceCardData;
  onOpen?: (card: SourceCardData) => void;
}) {
  const external = isExternal(card);
  const internal = !external && (!!card.docId || !!card.url);
  const body = (
    <>
      <div className="flex items-start gap-2">
        <span className="line-clamp-1 flex-1 text-sm font-medium text-foreground">
          {card.title}
        </span>
        {external ? (
          <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
        ) : internal ? (
          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
        ) : null}
      </div>
      {card.snippet && <p className="line-clamp-2 text-xs text-muted-foreground">{card.snippet}</p>}
      {(card.source || card.page != null) && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground/80">
          {card.source && <span className="truncate">{card.source}</span>}
          {card.page != null && <span>· p.{card.page}</span>}
        </div>
      )}
    </>
  );

  if (external) {
    return (
      <a href={card.url} target="_blank" rel="noreferrer" className={CARD_CLASS}>
        {body}
      </a>
    );
  }
  if (internal && onOpen) {
    return (
      <button type="button" onClick={() => onOpen(card)} className={CARD_CLASS}>
        {body}
      </button>
    );
  }
  if (internal && card.url) {
    return (
      <a href={card.url} className={CARD_CLASS}>
        {body}
      </a>
    );
  }
  return <div className={cn(CARD_CLASS, "cursor-default")}>{body}</div>;
}

/** Perplexity-style result list for one tool step: count-badged header + cards. */
export function SourceList({
  label,
  cards,
  onOpenSource,
}: {
  label: string;
  cards: SourceCardData[];
  onOpenSource?: (card: SourceCardData) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <span>{label}</span>
        <Badge variant="secondary" className="rounded-full px-1.5 py-0 text-xs">
          {cards.length}
        </Badge>
      </div>
      <div className="flex flex-col gap-2">
        {cards.map((card, i) => (
          <SourceCardRow
            key={`${card.docId ?? card.url ?? card.title}-${i}`}
            card={card}
            onOpen={onOpenSource}
          />
        ))}
      </div>
    </div>
  );
}
