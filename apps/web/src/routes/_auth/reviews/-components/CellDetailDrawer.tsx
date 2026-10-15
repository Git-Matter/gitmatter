import type { ReactNode } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/util/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ActorBadge } from "@/components/ActorBadge";
import type { Cell } from "@/lib/data/api";

// Soft-tinted flag pill (vs the grid's solid dot) — readable at panel size.
const FLAG_BADGE: Record<string, string> = {
  green: "bg-emerald-500/15 text-emerald-600",
  yellow: "bg-amber-500/15 text-amber-600",
  red: "bg-red-500/15 text-red-600",
  grey: "bg-muted text-muted-foreground",
};

/**
 * Right-slide panel showing one review cell in full: flag, the whole summary +
 * reasoning (no truncation), its grounding citations, and blame. Citation links
 * open the source document; quotations stay bound to captured text. Mirrors the
 * DocumentDrawer shell so the two panels feel the same.
 */
export function CellDetailDrawer({
  open,
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
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs",
            "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
          )}
        />
        <DialogPrimitive.Popup
          className={cn(
            "fixed inset-y-0 end-0 z-50 flex w-[480px] max-w-[96vw] flex-col bg-card text-foreground shadow-2xl outline-none",
            "data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right"
          )}
        >
          <div className="flex items-start justify-between gap-2 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <p className="truncate text-xs text-muted-foreground">{docTitle}</p>
              <h2 className="truncate text-base font-semibold">{columnName}</h2>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button size="xs" variant="outline" disabled={busy || !canRun} onClick={onRun}>
                {busy ? "…" : "Re-run"}
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
                    <Label>Flag</Label>
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                        FLAG_BADGE[content.flag] ?? FLAG_BADGE.grey
                      )}
                    >
                      {content.flag}
                    </span>
                  </section>

                  <section>
                    <Label>Summary</Label>
                    <p className="text-sm whitespace-pre-wrap">{content.summary}</p>
                  </section>

                  {content.reasoning && (
                    <section>
                      <Label>Reasoning</Label>
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
                    This cell hasn't been run yet.
                  </p>
                  <Button size="sm" disabled={busy || !canRun} onClick={onRun}>
                    {busy ? "Running…" : "Run cell"}
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </h3>
  );
}
