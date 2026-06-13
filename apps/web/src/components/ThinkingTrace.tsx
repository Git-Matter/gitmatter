import { useEffect, useState } from "react";
import { Brain, Check, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToolRun = { name: string; done: boolean };

/**
 * Collapsible reasoning trace. Auto-expands while the model thinks, then collapses
 * to a "Thought for Ns" summary once the answer starts. Click to toggle.
 */
export function ThinkingPanel({
  text,
  ms,
  streaming,
}: {
  text?: string;
  ms?: number;
  streaming?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(streaming));

  // Follow the thinking lifecycle: open while streaming, collapse when it ends.
  useEffect(() => {
    setOpen(Boolean(streaming));
  }, [streaming]);

  if (!text) return null;
  const label = streaming
    ? "Thinking…"
    : ms
      ? `Thought for ${Math.max(1, Math.round(ms / 1000))}s`
      : "Thought";

  return (
    <div className="rounded-lg border border-border bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <Brain className={cn("size-3.5", streaming && "animate-pulse")} />
        <span>{label}</span>
        <ChevronDown
          className={cn("ms-auto size-3.5 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="border-t border-border px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {text}
        </div>
      )}
    </div>
  );
}

/** Live tool-call pills: a spinner while running, a check once done. */
export function ToolPills({ tools }: { tools: ToolRun[] }) {
  if (!tools.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tools.map((t, i) => (
        <span
          key={`${t.name}-${i}`}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs",
            t.done
              ? "border-border text-muted-foreground"
              : "border-ring/40 bg-muted text-foreground"
          )}
        >
          {t.done ? (
            <Check className="size-3 shrink-0" />
          ) : (
            <Loader2 className="size-3 shrink-0 animate-spin" />
          )}
          {humanizeTool(t.name)}
          {t.done ? "" : "…"}
        </span>
      ))}
    </div>
  );
}

// Friendly present-tense label per tool. Falls back to the de-snaked name.
const TOOL_VERBS: Record<string, string> = {
  search: "Searching",
  fetch: "Reading document",
  search_case_law: "Searching case law",
  verify_citations: "Verifying citations",
  get_review: "Reading review",
  list_reviews: "Listing reviews",
  create_review: "Creating review",
  run_cell: "Running extraction",
  get_contract: "Reading contract",
  list_contracts: "Listing contracts",
  create_contract: "Drafting contract",
  propose_contract_edit: "Proposing edit",
  list_matters: "Listing matters",
  create_matter: "Creating matter",
  list_clients: "Listing clients",
  generate_docx: "Generating document",
  list_workflows: "Listing workflows",
  read_workflow: "Reading workflow",
};

function humanizeTool(name: string): string {
  return TOOL_VERBS[name] ?? name.replace(/_/g, " ");
}
