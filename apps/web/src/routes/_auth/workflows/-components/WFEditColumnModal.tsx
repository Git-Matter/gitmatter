import { useEffect, useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import { api, type Column } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type ColumnFormat, FORMAT_OPTIONS, formatIcon, formatLabel } from "./columnFormat";
import { getPresetConfig, PROMPT_PRESETS } from "./columnPresets";
import { TAG_COLORS } from "./pillUtils";
import { WorkflowModal } from "./WorkflowModal";

interface ColumnDraft {
  name: string;
  prompt: string;
  format: ColumnFormat;
  tags: string[];
  tagInput: string;
}

interface Props {
  column: Column;
  onClose: () => void;
  onSave: (col: Column) => void;
  onDelete: () => void;
}

export function WFEditColumnModal({ column, onClose, onSave, onDelete }: Props) {
  const [draft, setDraft] = useState<ColumnDraft>({
    name: column.name,
    prompt: column.prompt,
    format: (column.format as ColumnFormat) ?? "text",
    tags: column.tags ?? [],
    tagInput: "",
  });
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    setDraft({
      name: column.name,
      prompt: column.prompt,
      format: (column.format as ColumnFormat) ?? "text",
      tags: column.tags ?? [],
      tagInput: "",
    });
  }, [column]);

  function update(patch: Partial<ColumnDraft>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function commitTag() {
    const tag = draft.tagInput.trim();
    if (!tag || draft.tags.includes(tag)) {
      update({ tagInput: "" });
      return;
    }
    update({ tags: [...draft.tags, tag], tagInput: "" });
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitTag();
    } else if (e.key === "Backspace" && draft.tagInput === "" && draft.tags.length > 0) {
      update({ tags: draft.tags.slice(0, -1) });
    }
  }

  async function autoGeneratePrompt() {
    const title = draft.name.trim();
    if (!title) return;
    setGenerating(true);
    try {
      const { prompt } = await api.generateColumnPrompt({
        title,
        format: draft.format,
        tags: draft.format === "tag" ? draft.tags : undefined,
      });
      update({ prompt });
    } finally {
      setGenerating(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim() || !draft.prompt.trim()) return;
    onSave({
      index: column.index,
      name: draft.name.trim(),
      prompt: draft.prompt.trim(),
      format: draft.format,
      tags: draft.format === "tag" ? draft.tags : undefined,
    });
  }

  const FormatIcon = formatIcon(draft.format);
  const formId = "wf-edit-column-form";

  return (
    <WorkflowModal
      open
      onClose={onClose}
      breadcrumbs={["Workflows", "Edit column"]}
      secondaryAction={{ label: "Delete", variant: "danger", onClick: onDelete }}
      primaryAction={{
        label: "Save changes",
        type: "submit",
        form: formId,
        disabled: !draft.name.trim() || !draft.prompt.trim(),
      }}
    >
      <form id={formId} onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col py-1">
        {/* Name + presets */}
        <div className="flex items-start gap-2">
          <input
            type="text"
            value={draft.name}
            onChange={(e) => {
              const name = e.target.value;
              const preset = getPresetConfig(name);
              update({
                name,
                ...(preset
                  ? {
                      prompt: preset.prompt,
                      format: preset.format,
                      tags: preset.tags ?? [],
                      tagInput: "",
                    }
                  : {}),
              });
            }}
            placeholder="Column name"
            className="flex-1 bg-transparent font-serif text-2xl text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
            autoFocus
          />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  title="Column presets"
                  aria-label="Column presets"
                  className="mt-1.5 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                />
              }
            >
              <ChevronDown className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
              <DropdownMenuItem
                onClick={() =>
                  update({ name: "", prompt: "", format: "text", tags: [], tagInput: "" })
                }
              >
                No Preset
              </DropdownMenuItem>
              {PROMPT_PRESETS.map((preset) => (
                <DropdownMenuItem
                  key={preset.name}
                  onClick={() =>
                    update({
                      name: preset.name,
                      prompt: preset.prompt,
                      format: preset.format,
                      tags: preset.tags ?? [],
                      tagInput: "",
                    })
                  }
                >
                  {preset.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Format */}
        <div className="mt-4">
          <label className="text-sm font-medium text-muted-foreground">Format</label>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="mt-1 flex items-center justify-between gap-3 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground hover:border-ring focus:outline-none"
                />
              }
            >
              <span className="flex items-center gap-2">
                <FormatIcon className="h-3.5 w-3.5 text-muted-foreground" />
                {formatLabel(draft.format)}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup
                value={draft.format}
                onValueChange={(v) => update({ format: v as ColumnFormat, tags: [], tagInput: "" })}
              >
                {FORMAT_OPTIONS.map((o) => (
                  <DropdownMenuRadioItem key={o.value} value={o.value}>
                    <o.icon className="h-3.5 w-3.5 text-muted-foreground" />
                    {o.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Tags */}
        {draft.format === "tag" && (
          <div className="mt-3">
            <label className="text-sm font-medium text-muted-foreground">Tags</label>
            <div className="mt-1 flex flex-wrap gap-1.5 rounded-md border border-input px-2 py-1.5 focus-within:border-ring">
              {draft.tags.map((tag, tagIdx) => (
                <span
                  key={tag}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
                    TAG_COLORS[tagIdx % TAG_COLORS.length]
                  )}
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => update({ tags: draft.tags.filter((t) => t !== tag) })}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={draft.tagInput}
                onChange={(e) => update({ tagInput: e.target.value })}
                onKeyDown={handleTagKeyDown}
                onBlur={commitTag}
                placeholder="Add tag…"
                className="min-w-[80px] flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Press Enter or comma to add a tag.</p>
          </div>
        )}

        {/* Prompt */}
        <div className="mt-4 flex items-center justify-between">
          <label className="text-sm font-medium text-muted-foreground">Prompt</label>
          <button
            type="button"
            onClick={autoGeneratePrompt}
            disabled={!draft.name.trim() || generating}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:text-muted-foreground/40"
          >
            {generating ? (
              <span className="block h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-foreground" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Auto-Generate Prompt
          </button>
        </div>
        <textarea
          rows={6}
          value={draft.prompt}
          onChange={(e) => update({ prompt: e.target.value })}
          placeholder="Write the analysis prompt — describe what to extract from each document for this column…"
          className="mt-2 w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
        />
      </form>
    </WorkflowModal>
  );
}
