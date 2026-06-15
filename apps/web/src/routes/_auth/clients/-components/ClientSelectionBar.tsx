import { Download, Trash2 } from "lucide-react";
import type { Table } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import type { Client } from "@/lib/api";

export function ClientSelectionBar({
  table,
  selectedCount,
  selectAllMatching,
  rowCount,
  pageCount,
  onSelectAllMatching,
  onClear,
  onExport,
  onDelete,
}: {
  table: Table<Client>;
  selectedCount: number;
  selectAllMatching: boolean;
  rowCount: number;
  pageCount: number;
  onSelectAllMatching: () => void;
  onClear: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  if (selectedCount <= 0) return null;

  return (
    <div className="flex h-10 items-center justify-between gap-3 border-b border-border text-sm">
      <div className="flex items-center gap-3">
        <span className="font-medium">{selectedCount} selected</span>
        {!selectAllMatching && table.getIsAllRowsSelected() && rowCount > pageCount && (
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={onSelectAllMatching}
          >
            Select all {rowCount}
          </button>
        )}
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground hover:underline"
          onClick={onClear}
        >
          Clear
        </button>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onExport}>
          <Download className="size-4" />
          Export CSV
        </Button>
        <Button variant="destructive" size="sm" onClick={onDelete}>
          <Trash2 className="size-4" />
          Delete
        </Button>
      </div>
    </div>
  );
}
