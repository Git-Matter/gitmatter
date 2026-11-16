import { Input } from "@/components/ui/input";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, MessageSquare, Search, Table2, X } from "lucide-react";
import { Streamdown } from "streamdown";
import type { Column, WorkflowListItem } from "@/lib/data/api";
import { cn } from "@/lib/util/utils";
import { formatIcon, formatLabel } from "./columnFormats";
import { TAG_COLORS } from "./tagColors";

type WorkflowPreviewMode = "auto" | "prompt" | "columns";

interface WorkflowPickerPanelProps {
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

export function WorkflowPickerPanel({
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
}: WorkflowPickerPanelProps) {
  const selectedRowRef = useRef<HTMLButtonElement>(null);
  const filteredWorkflows = filterWorkflows(workflows, search);
  const noResultsMessage = getNoResultsMessage({ search, workflowType, emptyMessage });

  useEffect(() => {
    if (selectedRowRef.current) selectedRowRef.current.scrollIntoView({ block: "nearest" });
  }, [selected?.id]);

  return (
    <div className="flex min-h-0 flex-1 flex-row gap-3 overflow-hidden">
      <WorkflowListPane selected={selected} search={search} onSearchChange={onSearchChange}>
        <WorkflowList
          workflows={filteredWorkflows}
          selected={selected}
          loading={loading}
          emptyMessage={noResultsMessage}
          selectedRowRef={selectedRowRef}
          disabledWorkflow={disabledWorkflow}
          showTypeIcon={showTypeIcon}
          onSelect={onSelect}
        />
      </WorkflowListPane>

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

function filterWorkflows(workflows: WorkflowListItem[], search: string): WorkflowListItem[] {
  const searchText = search.trim().toLowerCase();
  if (!searchText) return workflows;

  return workflows.filter((workflow) => workflowSearchText(workflow).includes(searchText));
}

function workflowSearchText(workflow: WorkflowListItem): string {
  return [workflow.title, workflow.practice ?? "", workflow.isSystem ? "Built-in" : "Custom"]
    .join(" ")
    .toLowerCase();
}

function getNoResultsMessage({
  search,
  workflowType,
  emptyMessage,
}: {
  search: string;
  workflowType: WorkflowListItem["type"] | "all";
  emptyMessage?: string;
}) {
  if (emptyMessage) return emptyMessage;
  if (search) return "No matches found";
  if (workflowType === "all") return "No workflows found";
  return `No ${workflowType} workflows found`;
}

function WorkflowListPane({
  selected,
  search,
  onSearchChange,
  children,
}: {
  selected: WorkflowListItem | null;
  search: string;
  onSearchChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col overflow-hidden", selected ? "w-80 shrink-0" : "flex-1")}>
      <WorkflowSearchBox value={search} onChange={onSearchChange} />
      {children}
    </div>
  );
}

function WorkflowSearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="shrink-0 px-2 pt-3 pb-2">
      <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search workflows..."
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function WorkflowList({
  workflows,
  selected,
  loading,
  emptyMessage,
  selectedRowRef,
  disabledWorkflow,
  showTypeIcon,
  onSelect,
}: {
  workflows: WorkflowListItem[];
  selected: WorkflowListItem | null;
  loading: boolean;
  emptyMessage: string;
  selectedRowRef: React.RefObject<HTMLButtonElement | null>;
  disabledWorkflow?: (workflow: WorkflowListItem) => boolean;
  showTypeIcon: boolean;
  onSelect: (workflow: WorkflowListItem | null) => void;
}) {
  if (loading) return <WorkflowListSkeleton />;
  if (workflows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-1 overflow-y-auto">
      {workflows.map((workflow) => (
        <WorkflowRow
          key={workflow.id}
          workflow={workflow}
          selected={selected?.id === workflow.id}
          disabled={disabledWorkflow?.(workflow) ?? false}
          showTypeIcon={showTypeIcon}
          rowRef={selected?.id === workflow.id ? selectedRowRef : null}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function WorkflowRow({
  workflow,
  selected,
  disabled,
  showTypeIcon,
  rowRef,
  onSelect,
}: {
  workflow: WorkflowListItem;
  selected: boolean;
  disabled: boolean;
  showTypeIcon: boolean;
  rowRef: React.RefObject<HTMLButtonElement | null> | null;
  onSelect: (workflow: WorkflowListItem | null) => void;
}) {
  const TypeIcon = workflow.type === "tabular" ? Table2 : MessageSquare;

  return (
    <button
      ref={rowRef}
      type="button"
      disabled={disabled}
      onClick={() => onSelect(selected ? null : workflow)}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-xs transition-colors",
        selected ? "bg-muted text-foreground" : "hover:bg-muted/60",
        disabled && "cursor-not-allowed opacity-45"
      )}
    >
      <span
        className={cn(
          "flex-1 truncate",
          selected ? "font-medium text-foreground" : "text-foreground/80"
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
}

function WorkflowListSkeleton() {
  return (
    <div className="space-y-1">
      {[60, 45, 75, 50, 65, 40, 55].map((width) => (
        <div key={width} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5">
          <div className="h-3 animate-pulse rounded bg-muted" style={{ width: `${width}%` }} />
          <div className="h-3 w-10 shrink-0 animate-pulse rounded bg-muted" />
        </div>
      ))}
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
      ) : workflow.steps && workflow.steps.length > 1 ? (
        <div className="flex-1 space-y-2 overflow-y-auto rounded-md border border-border bg-muted/40 p-3">
          {workflow.steps.map((step, i) => (
            <div key={i} className="rounded-md border border-border bg-background px-3 py-2">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <span className="grid size-4 place-items-center rounded bg-foreground text-[9px] text-background">
                  {i + 1}
                </span>
                {step.title || `Step ${i + 1}`}
              </p>
              <div className="text-sm leading-relaxed text-foreground/80">
                <Streamdown>{step.promptMd || "_No prompt defined._"}</Streamdown>
              </div>
            </div>
          ))}
        </div>
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
