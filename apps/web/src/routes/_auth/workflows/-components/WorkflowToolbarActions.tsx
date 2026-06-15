import { ChevronDown } from "lucide-react";
import type { WorkflowListItem } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { WorkflowTab } from "./workflowList";
import { workflowTypeMeta } from "./workflowList";

export function WorkflowToolbarActions({
  selectedCount,
  tab,
  practices,
  typeFilter,
  practiceFilter,
  onTypeFilterChange,
  onPracticeFilterChange,
  onBulkRemove,
  onBulkUnhide,
}: {
  selectedCount: number;
  tab: WorkflowTab;
  practices: string[];
  typeFilter: WorkflowListItem["type"] | null;
  practiceFilter: string | null;
  onTypeFilterChange: (type: WorkflowListItem["type"] | null) => void;
  onPracticeFilterChange: (practice: string | null) => void;
  onBulkRemove: () => void;
  onBulkUnhide: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      {selectedCount > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button className="flex items-center gap-1 text-xs font-medium text-foreground transition-colors hover:text-foreground/80" />
            }
          >
            Actions
            <ChevronDown className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {tab === "hidden" ? (
              <DropdownMenuItem onClick={onBulkUnhide}>Unhide</DropdownMenuItem>
            ) : (
              <DropdownMenuItem variant="destructive" onClick={onBulkRemove}>
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              className={cn(
                "flex items-center gap-1 text-xs font-medium transition-colors",
                typeFilter ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            />
          }
        >
          {typeFilter ? workflowTypeMeta(typeFilter).label : "Filter by type"}
          <ChevronDown className="h-3 w-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuCheckboxItem checked={!typeFilter} onClick={() => onTypeFilterChange(null)}>
            All Types
          </DropdownMenuCheckboxItem>
          {(["assistant", "tabular"] as const).map((type) => (
            <DropdownMenuCheckboxItem
              key={type}
              checked={typeFilter === type}
              onClick={() => onTypeFilterChange(type)}
            >
              {workflowTypeMeta(type).label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              className={cn(
                "flex items-center gap-1 text-xs font-medium transition-colors",
                practiceFilter ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            />
          }
        >
          {practiceFilter ?? "Filter by practice"}
          <ChevronDown className="h-3 w-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
          <DropdownMenuCheckboxItem
            checked={!practiceFilter}
            onClick={() => onPracticeFilterChange(null)}
          >
            All Practices
          </DropdownMenuCheckboxItem>
          {practices.map((practice) => (
            <DropdownMenuCheckboxItem
              key={practice}
              checked={practiceFilter === practice}
              onClick={() => onPracticeFilterChange(practice)}
            >
              {practice}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
