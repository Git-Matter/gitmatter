import { useId, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Globe2,
  SlidersHorizontal,
  Square,
} from "lucide-react";
import { JURISDICTIONS, sourcesFor, type ProviderId } from "@workspace/registry";
import { Toggle } from "@/components/ui/toggle";
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
  canSend = true,
  sendLabel = "Send",
  availabilityMessage,
  contextLabel,
  scopeLabel,
  allowUpload = true,
  lockContext = false,
  modelSetupNeeded = false,
  onRetryModel,
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
  canSend?: boolean;
  sendLabel?: string;
  availabilityMessage?: string | null;
  contextLabel?: string;
  scopeLabel?: string;
  allowUpload?: boolean;
  lockContext?: boolean;
  modelSetupNeeded?: boolean;
  onRetryModel?: () => void;
}) {
  const [showSources, setShowSources] = useState(false);
  const scopeId = useId();
  const contextId = useId();
  const availabilityId = useId();
  const inputHint =
    availabilityMessage ||
    (hasProcessing
      ? "Wait for attached documents to finish processing before sending."
      : lockContext
        ? "Pause the workflow before editing its planned inputs."
        : busy
          ? "A response is in progress. Use Stop to interrupt it."
          : !input.trim()
            ? "Write a message to enable Send. Enter sends; Shift+Enter starts a new line."
            : "Enter sends; Shift+Enter starts a new line.");
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
    <div className="rounded-md border border-border bg-card focus-within:border-ring/60">
      <AttachChips attachments={attachments} onRemove={onRemove} />
      {scopeLabel && (
        <p id={scopeId} className="px-4 pt-3 text-xs text-muted-foreground">
          {scopeLabel}
        </p>
      )}
      {contextLabel && (
        <p id={contextId} className="px-4 pt-3 text-xs text-muted-foreground">
          {contextLabel}
        </p>
      )}
      <Textarea
        aria-label="Message for the assistant"
        aria-describedby={
          [scopeLabel ? scopeId : null, contextLabel ? contextId : null, availabilityId]
            .filter(Boolean)
            .join(" ") || undefined
        }
        rows={2}
        value={input}
        readOnly={lockContext}
        onChange={(e) => setInput(e.target.value)}
        placeholder={
          lockContext
            ? "Pause the workflow to edit planned inputs…"
            : "Ask a question about your documents…"
        }
        className="resize-none border-0 bg-transparent px-4 pt-3 shadow-none focus-visible:ring-0"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (canSend && !busy && !hasProcessing) onSend();
          }
        }}
      />
      <div className="@container/composer flex items-center justify-between gap-2 px-3 pb-3">
        <fieldset
          disabled={busy || lockContext}
          aria-label="Message model and context"
          className="flex min-w-0 flex-1 items-center gap-1 disabled:opacity-50"
        >
          <ModelPicker value={model} onChange={setModel} className="min-w-0 shrink" />
          <AttachControls
            attachments={attachments}
            onAdd={onAdd}
            onUpload={onUpload}
            allowUpload={allowUpload}
            matterId={matterId}
          />
        </fieldset>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant={showSources ? "secondary" : "ghost"}
            size="sm"
            tooltip="Message options"
            aria-pressed={showSources}
            disabled={busy || lockContext}
            onClick={() => setShowSources((open) => !open)}
            className="h-8 px-2 text-muted-foreground hover:text-foreground aria-pressed:text-foreground"
          >
            <SlidersHorizontal className="size-4" />
            <span className="hidden @xs/composer:inline">Options</span>
          </Button>
          {busy && onStop ? (
            <Button
              size="icon"
              onClick={onStop}
              title="Stop"
              aria-label="Stop"
              className="shrink-0"
            >
              <Square className="size-3.5 fill-current" />
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={onSend}
              disabled={busy || !input.trim() || hasProcessing || !canSend}
              title={hasProcessing ? "Waiting for documents to finish processing" : sendLabel}
              aria-label={sendLabel}
              className="shrink-0"
            >
              <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </div>
      {inputHint && (
        <p id={availabilityId} role="status" className="px-4 pb-3 text-xs text-muted-foreground">
          {inputHint}
        </p>
      )}
      {(modelSetupNeeded || onRetryModel) && (
        <div className="px-4 pb-3 text-xs">
          {modelSetupNeeded && (
            <a
              href="/settings?tab=ai"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4"
            >
              Open model settings in another tab
            </a>
          )}
          {onRetryModel && (
            <Button variant="ghost" size="xs" onClick={onRetryModel}>
              Retry model access
            </Button>
          )}
        </div>
      )}
      <p className="px-4 pb-3 text-xs text-muted-foreground">
        Research scope: {effectiveJurisdiction}
        {reasoning ? ` · Requested reasoning: ${reasoning}` : ""}
      </p>
      {showSources && (
        <fieldset
          disabled={busy || lockContext}
          aria-label="Message options"
          className="min-w-0 space-y-3 border-t border-border px-3 py-2.5 disabled:opacity-50"
        >
          <div className="flex flex-wrap items-center gap-3">
            <ReasoningPicker model={model} value={reasoning} onChange={setReasoning} />
            <ResearchSourcePicker
              value={jurisdiction}
              effectiveJurisdiction={effectiveJurisdiction}
              onChange={setJurisdiction}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {sources.map((source) => {
              const active = selectedSourceIds.includes(source.id);
              return (
                <Toggle
                  key={source.id}
                  size="sm"
                  variant="outline"
                  pressed={active}
                  title={source.tools.map((tool) => tool.label).join(", ")}
                  onPressedChange={() => toggleSource(source.id)}
                >
                  <Check className={cn("size-3", active ? "opacity-100" : "opacity-0")} />
                  <BookOpen className="size-3" />
                  <span className={cn("font-medium", active && "text-foreground")}>
                    {source.name}
                  </span>
                  <span>
                    {source.tools.length} {source.tools.length === 1 ? "action" : "actions"}
                  </span>
                </Toggle>
              );
            })}
          </div>
        </fieldset>
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
