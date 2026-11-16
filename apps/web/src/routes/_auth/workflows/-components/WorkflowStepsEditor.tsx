import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import type { WorkflowStep } from "@/lib/data/api";
import { Button } from "@/components/ui/button";
import { PromptMarkdownEditor } from "./PromptMarkdownEditor";

interface Props {
  value: WorkflowStep[];
  onChange?: (steps: WorkflowStep[]) => void;
  readOnly?: boolean;
}

// Ordered prompt steps for an assistant workflow. Each step runs as its own chat
// turn in sequence, so a later step builds on earlier answers.
export function WorkflowStepsEditor({ value, onChange, readOnly = false }: Props) {
  const steps = value.length ? value : [{ promptMd: "" }];

  function update(next: WorkflowStep[]) {
    onChange?.(next);
  }

  function patchStep(i: number, patch: Partial<WorkflowStep>) {
    update(steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  function addStep() {
    update([...steps, { promptMd: "" }]);
  }

  function removeStep(i: number) {
    update(steps.filter((_, idx) => idx !== i));
  }

  function moveStep(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    update(next);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {steps.map((step, i) => (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-3"
          >
            <div className="flex shrink-0 items-center gap-2">
              <span className="grid size-5 shrink-0 place-items-center rounded bg-foreground text-[11px] font-medium text-background">
                {i + 1}
              </span>
              <Input
                value={step.title ?? ""}
                onChange={(e) => patchStep(i, { title: e.target.value })}
                disabled={readOnly}
                placeholder={`Step ${i + 1} title (optional)`}
                className="flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground disabled:cursor-default"
              />
              {!readOnly && (
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Move up"
                    aria-label="Move step up"
                    disabled={i === 0}
                    onClick={() => moveStep(i, -1)}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Move down"
                    aria-label="Move step down"
                    disabled={i === steps.length - 1}
                    onClick={() => moveStep(i, 1)}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Remove step"
                    aria-label="Remove step"
                    disabled={steps.length === 1}
                    onClick={() => removeStep(i)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <div className="h-48">
              <PromptMarkdownEditor
                value={step.promptMd}
                onChange={readOnly ? undefined : (md) => patchStep(i, { promptMd: md })}
                readOnly={readOnly}
              />
            </div>
          </div>
        ))}
      </div>
      {!readOnly && (
        <button
          onClick={addStep}
          className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Add step
        </button>
      )}
    </div>
  );
}
