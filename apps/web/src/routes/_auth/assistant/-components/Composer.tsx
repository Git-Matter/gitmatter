import { useState } from "react";
import { ArrowRight, BookOpen, Check, ChevronDown, Globe2, Square } from "lucide-react";
import { JURISDICTIONS, sourcesFor, type ProviderId } from "@workspace/registry";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { ModelPicker } from "@/components/ModelPicker";
import { ReasoningPicker } from "./ReasoningPicker";
import { AttachChips, AttachControls } from "./ChatAttachments";
import { type ChatAttachment, type ReasoningEffort } from "../../../../lib/data/api";
import { cn } from "@/lib/util/utils";

/** The message composer — textarea, model/reasoning/attachment controls, send. */
export function Composer({
  input,
  setInput,
  model,
  setModel,
  jurisdiction,
  effectiveJurisdiction,
  setJurisdiction,
  sourceIds,
  setSourceIds,
  reasoning,
  setReasoning,
  attachments,
  onAdd,
  onRemove,
  onUpload,
  hasProcessing,
  busy,
  onSend,
  onStop,
  matterId,
}: {
  input: string;
  setInput: (v: string) => void;
  model: string;
  setModel: (v: string) => void;
  jurisdiction: string;
  effectiveJurisdiction: string;
  setJurisdiction: (v: string) => void;
  sourceIds: ProviderId[] | null;
  setSourceIds: (v: ProviderId[] | null) => void;
  reasoning: ReasoningEffort | null;
  setReasoning: (v: ReasoningEffort | null) => void;
  attachments: ChatAttachment[];
  onAdd: (a: ChatAttachment) => void;
  onRemove: (a: ChatAttachment) => void;
  onUpload: (file: File) => void;
  hasProcessing: boolean;
  busy: boolean;
  onSend: () => void;
  onStop?: () => void;
  matterId?: string;
}) {
  const [showSources, setShowSources] = useState(false);
  const sources = sourcesFor(effectiveJurisdiction);
  const selectedSourceIds = sourceIds ?? sources.map((source) => source.id);

  function toggleSource(sourceId: ProviderId) {
    const selected = new Set(selectedSourceIds);
    if (selected.has(sourceId)) selected.delete(sourceId);
    else selected.add(sourceId);

    const next = sources.filter((source) => selected.has(source.id)).map((source) => source.id);
    setSourceIds(next.length === sources.length ? null : next);
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-xs focus-within:border-ring/60">
      <AttachChips attachments={attachments} onRemove={onRemove} />
      <Textarea
        rows={2}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Ask a question about your documents…"
        className="resize-none border-0 bg-transparent px-4 pt-3 shadow-none focus-visible:ring-0"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
      />
      <div className="@container/composer flex items-center justify-between gap-2 px-3 pb-3">
        <div className="flex min-w-0 [scrollbar-width:none] items-center gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden">
          <ModelPicker value={model} onChange={setModel} />
          <ReasoningPicker model={model} value={reasoning} onChange={setReasoning} />
          <span className="mx-1 h-4 w-px shrink-0 bg-border" />
          <AttachControls
            attachments={attachments}
            onAdd={onAdd}
            onUpload={onUpload}
            matterId={matterId}
          />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant={showSources ? "secondary" : "ghost"}
            size="sm"
            tooltip="Sources"
            aria-pressed={showSources}
            disabled={sources.length === 0}
            onClick={() => setShowSources((open) => !open)}
            className="h-8 px-2 text-muted-foreground hover:text-foreground aria-pressed:text-foreground"
          >
            <BookOpen className="size-4" />
            <span className="hidden @xs/composer:inline">Sources</span>
          </Button>
          <ResearchSourcePicker
            value={jurisdiction}
            effectiveJurisdiction={effectiveJurisdiction}
            onChange={setJurisdiction}
          />
          {busy && onStop ? (
            <Button
              size="icon"
              onClick={onStop}
              title="Stop"
              aria-label="Stop"
              className="shrink-0 rounded-full"
            >
              <Square className="size-3.5 fill-current" />
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={onSend}
              disabled={busy || !input.trim() || hasProcessing}
              title={hasProcessing ? "Waiting for documents to finish processing" : "Send"}
              aria-label="Send"
              className="shrink-0 rounded-full"
            >
              <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </div>
      {showSources && sources.length > 0 && (
        <div className="border-t border-border px-3 py-2.5">
          <div className="flex flex-wrap gap-1.5">
            {sources.map((source) => {
              const active = selectedSourceIds.includes(source.id);
              return (
                <button
                  type="button"
                  key={source.id}
                  title={source.tools.map((tool) => tool.label).join(", ")}
                  aria-pressed={active}
                  onClick={() => toggleSource(source.id)}
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    active
                      ? "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                      : "border-border/60 bg-muted/40 text-muted-foreground/60 hover:text-muted-foreground"
                  )}
                >
                  <Check className={cn("size-3", active ? "opacity-100" : "opacity-0")} />
                  <BookOpen className="size-3" />
                  <span className={cn("font-medium", active && "text-foreground")}>
                    {source.name}
                  </span>
                  <span>
                    {source.tools.length} {source.tools.length === 1 ? "action" : "actions"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ResearchSourcePicker({
  value,
  effectiveJurisdiction,
  onChange,
}: {
  value: string;
  effectiveJurisdiction: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = value || `Default · ${effectiveJurisdiction}`;

  function pick(next: string) {
    onChange(next);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        title="Research source"
        aria-label="Research source"
        className="flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 text-sm whitespace-nowrap text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Globe2 className="size-4 shrink-0" />
        <span className="hidden @xs/composer:inline">{label}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-0 overflow-hidden p-1">
        <JurisdictionRow
          active={!value}
          code=""
          displayCode={effectiveJurisdiction}
          label="Default"
          onPick={pick}
        />
        <div className="my-1 h-px bg-border" />
        {JURISDICTIONS.map((j) => (
          <JurisdictionRow
            key={j.code}
            active={value === j.code}
            code={j.code}
            label={j.label}
            onPick={pick}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}

function JurisdictionRow({
  active,
  code,
  displayCode,
  label,
  onPick,
}: {
  active: boolean;
  code: string;
  displayCode?: string;
  label: string;
  onPick: (v: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(code)}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        active ? "bg-muted text-foreground" : "text-muted-foreground"
      )}
    >
      <Check className={cn("size-4 shrink-0", active ? "opacity-100" : "opacity-0")} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {(displayCode || code) && (
        <span className="font-mono text-xs text-muted-foreground">{displayCode || code}</span>
      )}
    </button>
  );
}
