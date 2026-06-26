import { lazy, Suspense } from "react";
import {
  AlertTriangle,
  ChevronRight,
  Copy,
  FileText,
  Lightbulb,
  type LucideIcon,
  Pencil,
  Search,
  Target,
  Wrench,
} from "lucide-react";
import { TOOL_META, type ToolName } from "@workspace/registry";
import {
  ChainOfThoughtSearchResult,
  ChainOfThoughtSearchResults,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import { ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { SourceList } from "@/components/ai-elements/source-card";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { type SourceCard } from "@/lib/data/api";
import { useActivityPanel } from "./activity-context";
import { type Step } from "./useChatSession";

const StreamdownRenderer = lazy(() => import("@/components/ai-elements/streamdown-renderer"));

const TOOL_VERBS: Record<string, string> = {
  get_document: "read document",
  propose_document_edit: "proposed document edit",
  resolve_document_edit: "resolved document edit",
  generate_docx: "generated document",
  get_review: "read review",
  read_review_cells: "read review cells",
  create_review: "created review",
  run_cell: "ran review cell",
  search: "searched",
  fetch: "opened source",
  list_matters: "listed matters",
  list_matter_documents: "listed documents",
  history: "read history",
  diff: "compared versions",
  blame: "checked blame",
};

function toolName(step: Step) {
  return typeof step.detail?.tool === "string" ? step.detail.tool : null;
}

function toolLabel(name: string): string {
  if (name in TOOL_META) return TOOL_META[name as ToolName].traceLabel.toLowerCase();
  return TOOL_VERBS[name] ?? name.replace(/_/g, " ");
}

function detailText(detail: Record<string, unknown>, key: string) {
  const value = detail[key];
  return typeof value === "string" && value ? value : null;
}

function formatDuration(ms: number) {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds === 1) return "a second";
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes === 1 ? "a minute" : `${minutes} minutes`;
}

// Compact per-row duration: "0.8s" / "1.4m".
function compactDuration(ms: number) {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function traceDuration(steps: Step[]) {
  const first = steps.find((step) => step.startedAt)?.startedAt;
  const last = [...steps].reverse().find((step) => step.endedAt || step.startedAt);
  if (!first || !last) return null;
  const end = last.endedAt ?? last.startedAt;
  if (!end) return null;
  return Math.max(0, new Date(end).getTime() - new Date(first).getTime());
}

function summaryFor(step: Step) {
  if (!step.summary) return null;
  if (step.kind !== "tool_call") return step.summary;
  const tool = toolName(step);
  const rawToolLabel = tool?.replace(/_/g, " ");
  if (step.summary === rawToolLabel) return null;
  return step.summary;
}

function labelFor(step: Step) {
  const detail = step.detail ?? {};
  if (step.kind === "thinking_process") return "Thought through the request";
  if (step.kind === "assess_query") return "Assessed the request";
  if (step.kind === "review_file") {
    const title = detailText(detail, "title");
    return title ? `Reviewed file "${title}"` : "Reviewed attached file";
  }
  if (step.kind === "search_terms") return "Checked terms";
  if (step.kind === "tool_call") {
    const tool = toolName(step);
    return tool ? toolLabel(tool).replace(/^./, (c) => c.toUpperCase()) : "Used tool";
  }
  if (step.kind === "draft_answer") return "Generated answer";
  if (step.kind === "error") return summaryFor(step) ?? "Hit an error";
  return step.label;
}

function iconFor(step: Step): LucideIcon {
  switch (step.kind) {
    case "thinking_process":
      return Lightbulb;
    case "assess_query":
      return Target;
    case "review_file":
      return FileText;
    case "search_terms":
      return Search;
    case "draft_answer":
      return Pencil;
    case "error":
      return AlertTriangle;
    default:
      return Wrench;
  }
}

function searchTerms(step: Step): string[] {
  const terms = step.detail?.terms;
  return Array.isArray(terms) ? terms.map(String) : [];
}

function sourcesOf(step: Step): SourceCard[] {
  const sources = step.detail?.sources;
  return Array.isArray(sources) ? (sources as SourceCard[]) : [];
}

function activityLines(steps: Step[]) {
  return steps.map((step) => `Assistant ${labelFor(step)}`);
}

function copyText(lines: string[]) {
  void navigator.clipboard?.writeText(lines.join("\n")).catch(() => {});
}

/** Per-step detail body, rendered inside the activity drawer. */
function StepDetail({
  step,
  onOpenSource,
}: {
  step: Step;
  onOpenSource?: (card: SourceCard) => void;
}) {
  const detail = step.detail ?? {};

  if (step.kind === "thinking_process") {
    const text = detailText(detail, "text") ?? summaryFor(step);
    if (!text) return null;
    return (
      <div className="prose prose-sm max-w-none text-muted-foreground">
        <Suspense fallback={<p className="whitespace-pre-wrap">{text}</p>}>
          <StreamdownRenderer>{text}</StreamdownRenderer>
        </Suspense>
      </div>
    );
  }

  if (step.kind === "search_terms") {
    const terms = searchTerms(step);
    if (!terms.length) return null;
    return (
      <ChainOfThoughtSearchResults>
        {terms.map((term) => (
          <ChainOfThoughtSearchResult key={term}>{term}</ChainOfThoughtSearchResult>
        ))}
      </ChainOfThoughtSearchResults>
    );
  }

  if (step.kind === "tool_call") {
    const sources = sourcesOf(step);
    if (sources.length) {
      return <SourceList label={labelFor(step)} cards={sources} onOpenSource={onOpenSource} />;
    }
    return (
      <>
        {detail.input !== undefined && <ToolInput input={detail.input} />}
        <ToolOutput
          output={(detail.output ?? null) as never}
          errorText={(detail.error ?? null) as never}
        />
      </>
    );
  }

  // assess_query / review_file / draft_answer / error: scalar key/value detail.
  const entries = Object.entries(detail).filter(
    ([, v]) => typeof v === "string" || typeof v === "number" || typeof v === "boolean"
  );
  if (!entries.length) return null;
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-muted-foreground">{key}</dt>
          <dd className="break-words text-foreground">{String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The full activity timeline — every step with its detail. Rendered inside the
 *  pushing ActivityPanel. */
export function ActivityTimeline({
  steps,
  onOpenSource,
}: {
  steps: Step[];
  onOpenSource?: (card: SourceCard) => void;
}) {
  return (
    <>
      {steps.map((step) => (
        <ChainOfThoughtStep
          key={step.id}
          icon={iconFor(step)}
          status={step.status === "running" ? "active" : "complete"}
          label={
            <div className="flex w-full items-center gap-2">
              <span className={step.status === "error" ? "flex-1 text-destructive" : "flex-1"}>
                {labelFor(step)}
              </span>
              {step.status !== "running" && typeof step.durationMs === "number" && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {compactDuration(step.durationMs)}
                </span>
              )}
            </div>
          }
        >
          <StepDetail step={step} onOpenSource={onOpenSource} />
        </ChainOfThoughtStep>
      ))}
    </>
  );
}

/**
 * Inline, the assistant's work collapses to one quiet "Thought for Ns" pill.
 * Clicking it opens the right-side activity panel (which pushes the chat aside)
 * holding the whole timeline — reasoning text, tool params/results, and
 * Perplexity-style source cards.
 */
export function StepsTimeline({
  steps,
  onOpenSource,
}: {
  steps: Step[];
  onOpenSource?: (card: SourceCard) => void;
}) {
  const panel = useActivityPanel();
  if (!steps.length) return null;

  const running = steps.some((step) => step.status === "running");
  const duration = traceDuration(steps);
  const lines = activityLines(steps);

  return (
    <div className="not-prose mb-4 flex items-center gap-2">
      <button
        type="button"
        onClick={() => panel?.open(steps, onOpenSource)}
        className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <Lightbulb className="size-4" />
        {running ? (
          <Shimmer duration={1}>Thinking…</Shimmer>
        ) : (
          <span>Thought for {duration === null ? "a moment" : formatDuration(duration)}</span>
        )}
        <ChevronRight className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label="Copy activity trace"
        onClick={() => copyText(lines)}
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Copy className="size-4" />
      </button>
    </div>
  );
}
