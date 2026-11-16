import { FormFeedback } from "@/components/FormFeedback";
import { Input } from "@/components/ui/input";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import { api, type Column } from "@/lib/data/api";
import { cn } from "@/lib/util/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type ColumnFormat, FORMAT_OPTIONS, formatIcon, formatLabel } from "./columnFormats";
import { getPresetConfig, PROMPT_PRESETS } from "./columnPromptPresets";
import { TAG_COLORS } from "./tagColors";
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

export function ColumnEditModal({ column, onClose, onSave, onDelete }: Props) {
  const [draft, setDraft] = useState<ColumnDraft>(() => createDraft(column));
  const initial = useRef(JSON.stringify(createDraft(column))).current;
  const [generationError, setGenerationError] = useState<unknown>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    setDraft(createDraft(column));
  }, [column]);

  function update(patch: Partial<ColumnDraft>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function commitTag() {
    const tag = draft.tagInput.trim();
    if (!tag) {
      update({ tagInput: "" });
      return;
    }
    if (draft.tags.includes(tag)) {
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
    setGenerationError(null);
    try {
      const { prompt } = await api.generateColumnPrompt({
        title,
        format: draft.format,
        tags: draft.format === "tag" ? draft.tags : undefined,
      });
      update({ prompt });
    } catch (error) {
      setGenerationError(error);
    } finally {
      setGenerating(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim() || !draft.prompt.trim()) return;
    onSave(toSavedColumn(column.index, draft));
  }

  const formId = "column-edit-form";

  return (
    <WorkflowModal
      open
      onClose={onClose}
      dirty={JSON.stringify(draft) !== initial}
      saving={generating}
      pendingTitle="Prompt generation in progress"
      pendingDescription="The request has been sent. Wait for its result; closing the editor would not cancel it."
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
        <FormFeedback error={generationError} title="Prompt was not generated" />
        <fieldset disabled={generating} className="flex min-w-0 flex-col">
          <ColumnNameField draft={draft} onChange={update} />
          <ColumnFormatField value={draft.format} onChange={(format) => update({ format })} />
          {draft.format === "tag" && (
            <ColumnTagsField
              tags={draft.tags}
              tagInput={draft.tagInput}
              onChange={update}
              onKeyDown={handleTagKeyDown}
              onBlur={commitTag}
            />
          )}
          <ColumnPromptField
            value={draft.prompt}
            canGenerate={!!draft.name.trim()}
            generating={generating}
            onChange={(prompt) => update({ prompt })}
            onGenerate={autoGeneratePrompt}
          />
        </fieldset>
      </form>
    </WorkflowModal>
  );
}

function createDraft(column: Column): ColumnDraft {
  return {
    name: column.name,
    prompt: column.prompt,
    format: (column.format as ColumnFormat) ?? "text",
    tags: column.tags ?? [],
    tagInput: "",
  };
}

function toSavedColumn(index: number, draft: ColumnDraft): Column {
  return {
    index,
    name: draft.name.trim(),
    prompt: draft.prompt.trim(),
    format: draft.format,
    tags: draft.format === "tag" ? draft.tags : undefined,
  };
}

function presetDraft(name: string): Partial<ColumnDraft> {
  const preset = getPresetConfig(name);
  if (!preset) return { name };
  return {
    name,
    prompt: preset.prompt,
    format: preset.format,
    tags: preset.tags ?? [],
    tagInput: "",
  };
}

function ColumnNameField({
  draft,
  onChange,
}: {
  draft: ColumnDraft;
  onChange: (patch: Partial<ColumnDraft>) => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <Input
        type="text"
        value={draft.name}
        onChange={(event) => onChange(presetDraft(event.target.value))}
        placeholder="Column name"
        className="flex-1 bg-transparent font-serif text-2xl text-foreground placeholder:text-muted-foreground focus:outline-none"
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
              onChange({ name: "", prompt: "", format: "text", tags: [], tagInput: "" })
            }
          >
            No Preset
          </DropdownMenuItem>
          {PROMPT_PRESETS.map((preset) => (
            <DropdownMenuItem
              key={preset.name}
              onClick={() =>
                onChange({
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
  );
}

function ColumnFormatField({
  value,
  onChange,
}: {
  value: ColumnFormat;
  onChange: (format: ColumnFormat) => void;
}) {
  const FormatIcon = formatIcon(value);
  return (
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
            {formatLabel(value)}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuRadioGroup
            value={value}
            onValueChange={(nextValue) => onChange(nextValue as ColumnFormat)}
          >
            {FORMAT_OPTIONS.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                <option.icon className="h-3.5 w-3.5 text-muted-foreground" />
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ColumnTagsField({
  tags,
  tagInput,
  onChange,
  onKeyDown,
  onBlur,
}: {
  tags: string[];
  tagInput: string;
  onChange: (patch: Partial<ColumnDraft>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onBlur: () => void;
}) {
  return (
    <div className="mt-3">
      <label className="text-sm font-medium text-muted-foreground">Tags</label>
      <div className="mt-1 flex flex-wrap gap-1.5 rounded-md border border-input px-2 py-1.5 focus-within:border-ring">
        {tags.map((tag, tagIndex) => (
          <span
            key={tag}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
              TAG_COLORS[tagIndex % TAG_COLORS.length]
            )}
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange({ tags: tags.filter((currentTag) => currentTag !== tag) })}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        <Input
          type="text"
          value={tagInput}
          onChange={(event) => onChange({ tagInput: event.target.value })}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          placeholder="Add tag..."
          className="min-w-[80px] flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Press Enter or comma to add a tag.</p>
    </div>
  );
}

function ColumnPromptField({
  value,
  canGenerate,
  generating,
  onChange,
  onGenerate,
}: {
  value: string;
  canGenerate: boolean;
  generating: boolean;
  onChange: (prompt: string) => void;
  onGenerate: () => void;
}) {
  return (
    <>
      <div className="mt-4 flex items-center justify-between">
        <label className="text-sm font-medium text-muted-foreground">Prompt</label>
        <button
          type="button"
          onClick={onGenerate}
          disabled={!canGenerate || generating}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:text-muted-foreground/40"
        >
          {generating ? (
            <span className="block h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-foreground" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Auto-generate prompt
        </button>
      </div>
      <textarea
        rows={6}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Write the analysis prompt. Describe what to extract from each document for this column."
        className="mt-2 w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
      />
    </>
  );
}
