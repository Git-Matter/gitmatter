import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { type Step } from "./useChatSession";

// Past-tense labels for the timeline (Claude-style: "Read", "Edited"). Falls
// back to a humanized tool name for anything unmapped.
const TOOL_VERBS: Record<string, string> = {
  get_document: "Read document",
  propose_document_edit: "Proposed edit",
  resolve_document_edit: "Resolved edit",
  generate_docx: "Created document",
  get_review: "Read review",
  read_review_cells: "Read review",
  create_review: "Created review",
  run_cell: "Ran review cell",
  search: "Searched",
  fetch: "Fetched source",
  search_case_law: "Searched case law",
  verify_citations: "Verified citations",
  list_matters: "Listed matters",
  list_matter_documents: "Listed documents",
  history: "Read history",
  diff: "Compared versions",
  blame: "Checked blame",
};

function toolLabel(name: string): string {
  return TOOL_VERBS[name] ?? name.replace(/_/g, " ");
}

function StepDot({ active }: { active: boolean }) {
  return (
    <span
      className={
        "mt-1.5 size-2 shrink-0 rounded-full " +
        (active ? "bg-emerald-500" : "bg-muted-foreground/40")
      }
    />
  );
}

function ReasoningStep({ step }: { step: Extract<Step, { kind: "reasoning" }> }) {
  return (
    <Collapsible defaultOpen={step.streaming} className="min-w-0 flex-1">
      <CollapsibleTrigger className="group flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        {step.streaming ? <Shimmer duration={1}>Thought process</Shimmer> : "Thought process"}
        <ChevronDown className="size-3.5 transition-transform group-aria-expanded:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground/70">{step.text}</p>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * The assistant's execution timeline: reasoning blocks and tool calls in the
 * order the model emitted them, under a collapsible "Completed in N steps"
 * header (the in-app mirror of Claude's step trace).
 */
export function StepsTimeline({ steps }: { steps: Step[] }) {
  if (!steps.length) return null;
  const working = steps.some((s) => (s.kind === "reasoning" ? s.streaming : !s.done));
  const header = working
    ? "Working…"
    : `Completed in ${steps.length} step${steps.length > 1 ? "s" : ""}`;

  return (
    <Collapsible defaultOpen className="not-prose mb-4 rounded-md border">
      <CollapsibleTrigger className="group flex w-full items-center justify-between px-3 py-2 text-sm font-medium hover:bg-muted/50">
        {working ? <Shimmer duration={1}>{header}</Shimmer> : header}
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-aria-expanded:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-2 px-3 pb-3">
        {steps.map((s, i) =>
          s.kind === "reasoning" ? (
            <div key={i} className="flex items-start gap-2">
              <StepDot active={!s.streaming} />
              <ReasoningStep step={s} />
            </div>
          ) : (
            <div key={i} className="flex items-start gap-2 text-sm">
              <StepDot active={s.done} />
              <span className="font-medium">{toolLabel(s.name)}</span>
            </div>
          )
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
