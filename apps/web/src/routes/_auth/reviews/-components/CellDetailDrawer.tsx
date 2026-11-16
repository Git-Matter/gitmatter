import { useEffect, useId, useRef, type ReactNode } from "react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ActorBadge } from "@/components/ActorBadge";
import type { Cell } from "@/lib/data/api";

const FLAG_VARIANT = {
  green: "success",
  yellow: "warning",
  red: "destructive",
  grey: "secondary",
} as const;

/**
 * Right-slide panel showing one review cell in full: flag, the whole summary +
 * reasoning (no truncation), its grounding citations, and blame. Citation links
 * open the source document; quotations stay bound to captured text. Mirrors the
 * DocumentDrawer shell so the two panels feel the same.
 */
export function CellDetailDrawer({
  open,
  inline = false,
  columnName,
  docTitle,
  cell,
  busy,
  canRun = true,
  onRun,
  onClose,
  onOpenSource,
  decisions,
  sourceVersionChanged,
  reviewedSourceUrl,
}: {
  open: boolean;
  inline?: boolean;
  columnName: string;
  docTitle: string;
  cell?: Cell;
  busy: boolean;
  canRun?: boolean;
  onRun: () => void;
  onClose: () => void;
  onOpenSource: (page?: number) => void;
  decisions?: ReactNode;
  sourceVersionChanged?: boolean;
  reviewedSourceUrl?: string;
}) {
  const content = cell?.content;
  const citations = cell?.citations ?? [];
  const headingId = useId();
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!inline || !open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    panel?.focus({ preventScroll: true });
    return () => {
      if (
        opener?.isConnected &&
        (panel?.contains(document.activeElement) || document.activeElement === document.body)
      )
        opener.focus({ preventScroll: true });
    };
  }, [inline, open]);
  const Title = inline ? "h2" : SheetTitle;
  const Description = inline ? "p" : SheetDescription;
  const body = (
    <>
      <div className="flex items-start justify-between gap-2 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{docTitle}</p>
          <Title id={headingId} className="truncate font-sans text-base font-medium">
            {columnName}
          </Title>
          <Description className="sr-only">
            Finding for {docTitle}. Inspect the captured sources before recording a decision.
          </Description>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="xs" variant="outline" disabled={busy || !canRun} onClick={onRun}>
            {busy ? "Re-running…" : "Re-run"}
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-6 px-5 py-4">
          {content ? (
            <>
              <section>
                <Label>Finding flag</Label>
                <Badge variant={FLAG_VARIANT[content.flag] ?? "secondary"} className="capitalize">
                  {content.flag}
                </Badge>
              </section>

              <section>
                <Label>Summary</Label>
                <p className="text-sm whitespace-pre-wrap">{content.summary}</p>
              </section>

              {content.reasoning && (
                <section>
                  <Label>Finding explanation</Label>
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                    {content.reasoning}
                  </p>
                </section>
              )}

              <section>
                <Label>Sources{citations.length ? ` (${citations.length})` : ""}</Label>
                {sourceVersionChanged && (
                  <p className="mb-3 text-sm text-muted-foreground">
                    These quotations refer to the captured review source. The current draft is a
                    different version; its locations may differ.
                  </p>
                )}
                {reviewedSourceUrl && (
                  <a
                    href={reviewedSourceUrl}
                    className="mb-3 block text-sm underline underline-offset-4"
                  >
                    Download the reviewed source version
                  </a>
                )}
                {citations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No citations.</p>
                ) : (
                  <ul className="space-y-2">
                    {citations.map((c, i) => (
                      <li key={i}>
                        <button
                          onClick={() => onOpenSource()}
                          className="block w-full rounded-md border border-border p-2 text-start transition-colors hover:border-bronze hover:bg-bronze-tint/40"
                        >
                          <span className="block text-xs text-muted-foreground italic">
                            "{c.quote}"
                          </span>
                          <span className="mt-2 block text-xs">
                            {sourceVersionChanged ? "Open current draft" : "Open source"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {decisions}

              {cell?.blame && (
                <section>
                  <Label>Last change</Label>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <ActorBadge
                      actorType={cell.blame.actorType}
                      agentLabel={cell.blame.agentLabel}
                      actorId={cell.blame.actorId}
                      actorName={cell.blame.actorName}
                    />
                    <span className="font-mono">{cell.blame.op}</span>
                    <span className="text-muted-foreground">#{cell.blame.seq}</span>
                  </div>
                  <p className="mt-1 text-xs">{cell.blame.message}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(cell.blame.createdAt).toLocaleString()}
                  </p>
                </section>
              )}
            </>
          ) : (
            <div className="py-10 text-center">
              <p className="mb-3 text-sm text-muted-foreground">
                {cell?.status === "error"
                  ? "This rule failed. Inspect the source or explicitly retry it."
                  : busy || cell?.status === "generating"
                    ? "This finding is being generated."
                    : cell?.status === "pending"
                      ? "This finding is pending."
                      : "This cell hasn't been run yet."}
              </p>
              <Button size="sm" disabled={busy || !canRun} onClick={onRun}>
                {busy ? "Running…" : "Run cell"}
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </>
  );
  if (inline)
    return open ? (
      <aside
        ref={panelRef}
        tabIndex={-1}
        aria-labelledby={headingId}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !event.defaultPrevented) {
            event.preventDefault();
            onClose();
          }
        }}
        className="relative flex min-h-0 w-inspector shrink-0 flex-col border-s border-border bg-card text-foreground outline-none"
      >
        {body}
      </aside>
    ) : null;
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent showCloseButton={false}>{body}</SheetContent>
    </Sheet>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <h3 className="mb-1.5 text-xs font-medium text-foreground">{children}</h3>;
}
