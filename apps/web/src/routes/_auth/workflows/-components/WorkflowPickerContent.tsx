import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, MessageSquare, Search, Table2, X } from "lucide-react";
import { Streamdown } from "streamdown";
import type { Column, WorkflowListItem } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatIcon, formatLabel } from "./columnFormat";
import { TAG_COLORS } from "./pillUtils";

type WorkflowPreviewMode = "auto" | "prompt" | "columns";

interface WorkflowPickerContentProps {
  workflows: WorkflowListItem[];
  selected: WorkflowListItem | null;
  onSelect: (workflow: WorkflowListItem | null) => void;
  search: string;
  onSearchChange: (value: string) => void;
  loading?: boolean;
  workflowType?: WorkflowListItem["type"] | "all";
  emptyMessage?: string;
  previewMode?: WorkflowPreviewMode;
  disabledWorkflow?: (workflow: WorkflowListItem) => boolean;
  showTypeIcon?: boolean;
  allowClearPreview?: boolean;
}

export function WorkflowPickerContent({
  workflows,
  selected,
  onSelect,
  search,
  onSearchChange,
  loading = false,
  workflowType = "all",
  emptyMessage,
  previewMode = "auto",
  disabledWorkflow,
  showTypeIcon = false,
  allowClearPreview = true,
}: WorkflowPickerContentProps) {
  const selectedRowRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (selectedRowRef.current) selectedRowRef.current.scrollIntoView({ block: "nearest" });
  }, [selected?.id]);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredWorkflows = normalizedSearch
    ? workflows.filter((workflow) =>
        [workflow.title, workflow.practice ?? "", workflow.isSystem ? "Built-in" : "Custom"]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch)
      )
    : workflows;
  const resolvedEmptyMessage =
    emptyMessage ??
    (search
      ? "No matches found"
      : workflowType === "all"
        ? "No workflows found"
        : `No ${workflowType} workflows found`);

  return (
    <div className="flex min-h-0 flex-1 flex-row gap-3 overflow-hidden">
      <div className={cn("flex flex-col overflow-hidden", selected ? "w-80 shrink-0" : "flex-1")}>
        <div className="shrink-0 px-2 pt-3 pb-2">
          <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search workflows..."
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            {search && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="space-y-1">
            {[60, 45, 75, 50, 65, 40, 55].map((width, index) => (
              <div
                key={index}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5"
              >
                <div
                  className="h-3 animate-pulse rounded bg-muted"
                  style={{ width: `${width}%` }}
                />
                <div className="h-3 w-10 shrink-0 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : filteredWorkflows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{resolvedEmptyMessage}</p>
        ) : (
          <div className="space-y-1 overflow-y-auto">
            {filteredWorkflows.map((workflow) => {
              const disabled = disabledWorkflow?.(workflow) ?? false;
              const isSelected = selected?.id === workflow.id;
              const TypeIcon = workflow.type === "tabular" ? Table2 : MessageSquare;
              return (
                <button
                  key={workflow.id}
                  ref={isSelected ? selectedRowRef : null}
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(isSelected ? null : workflow)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-xs transition-colors",
                    isSelected ? "bg-muted text-foreground" : "hover:bg-muted/60",
                    disabled && "cursor-not-allowed opacity-45"
                  )}
                >
                  <span
                    className={cn(
                      "flex-1 truncate",
                      isSelected ? "font-medium text-foreground" : "text-foreground/80"
                    )}
                  >
                    {workflow.title}
                  </span>
                  {showTypeIcon ? (
                    <TypeIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {workflow.isSystem ? "Built-in" : "Custom"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selected && (
        <WorkflowPreview
          workflow={selected}
          mode={previewMode}
          onClear={() => onSelect(null)}
          allowClear={allowClearPreview}
        />
      )}
    </div>
  );
}

function WorkflowPreview({
  workflow,
  mode,
  onClear,
  allowClear,
}: {
  workflow: WorkflowListItem;
  mode: WorkflowPreviewMode;
  onClear: () => void;
  allowClear: boolean;
}) {
  const resolvedMode =
    mode === "auto" ? (workflow.type === "tabular" ? "columns" : "prompt") : mode;
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex h-14 shrink-0 items-center justify-between pt-3 pb-2">
        <p className="text-sm font-medium text-foreground">Workflow Details</p>
        {allowClear ? (
          <button
            type="button"
            onClick={onClear}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {resolvedMode === "columns" ? (
        <WorkflowColumnPreview columns={workflow.columnsConfig ?? []} />
      ) : (
        <div className="flex-1 overflow-y-auto rounded-md border border-border bg-muted/40 px-4 py-3 text-sm leading-relaxed text-foreground/80">
          <Streamdown>{workflow.promptMd || "_No prompt defined._"}</Streamdown>
        </div>
      )}
    </div>
  );
}

function WorkflowColumnPreview({ columns }: { columns: Column[] }) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const sortedColumns = [...columns].sort((a, b) => a.index - b.index);
  return (
    <div className="flex-1 overflow-y-auto rounded-md border border-border bg-muted/40">
      {sortedColumns.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">No columns defined</p>
      ) : (
        sortedColumns.map((column) => {
          const isExpanded = expandedIndex === column.index;
          const FormatIcon = formatIcon(column.format ?? "text");
          return (
            <div key={column.index} className="border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() => setExpandedIndex(isExpanded ? null : column.index)}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs transition-colors hover:bg-background"
              >
                <FormatIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate text-foreground">{column.name}</span>
                <span className="shrink-0 text-muted-foreground">
                  {formatLabel(column.format ?? "text")}
                </span>
                <ChevronDown
                  className={cn(
                    "h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-150",
                    isExpanded && "rotate-180"
                  )}
                />
              </button>
              {isExpanded ? (
                <div className="space-y-3 border-t border-border bg-background px-4 py-3 text-sm leading-relaxed text-foreground/80">
                  {column.tags && column.tags.length > 0 ? (
                    <div>
                      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Tags</p>
                      <div className="flex flex-wrap gap-1.5">
                        {column.tags.map((tag, tagIdx) => (
                          <span
                            key={tag}
                            className={cn(
                              "inline-block rounded-full px-1.5 py-0.5 text-[10px]",
                              TAG_COLORS[tagIdx % TAG_COLORS.length]
                            )}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div>
                    <p className="mb-1 text-[11px] font-medium text-muted-foreground">Prompt</p>
                    <Streamdown>{column.prompt || "_No prompt defined._"}</Streamdown>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}
