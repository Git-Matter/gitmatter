import { createColumnHelper } from "@tanstack/react-table";
import {
  Download,
  FileText,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StateCue } from "@/components/StateCue";
import { VersionChip } from "@/routes/_auth/matters/-components/VersionChip";
import { formatBytes, formatShortDate } from "@/lib/format/format";
import type { Doc, Folder } from "@/lib/data/api";

// The Documents tab shows folders and documents in one table, so rows are a
// union: folder rows are navigation-only (no select / status / actions), doc
// rows carry the full document affordances.
export type DocRow =
  | { kind: "folder"; id: string; folder: Folder }
  | { kind: "doc"; id: string; doc: Doc };

export function DocStatusCue({ status }: { status: Doc["status"] }) {
  if (status === "ready") return <span className="text-muted-foreground">Ready</span>;
  if (status === "failed")
    return <span className="text-xs font-medium text-destructive">Failed</span>;
  return <StateCue tone="bronze">{status === "processing" ? "Extracting" : "Queued"}</StateCue>;
}

const columnHelper = createColumnHelper<DocRow>();

export function matterDocumentColumns(handlers: {
  canEdit: boolean;
  onReExtract: (id: string) => void;
  onRename: (doc: Doc) => void;
  onDownload: (id: string) => void;
  onUploadVersion: (id: string) => void;
  onDelete: (doc: Doc) => void;
}) {
  return [
    columnHelper.display({
      id: "select",
      size: 44,
      enableResizing: false,
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllRowsSelected()}
          onChange={table.getToggleAllRowsSelectedHandler()}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) =>
        row.original.kind === "doc" ? (
          <Checkbox
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            onClick={(e) => e.stopPropagation()}
            aria-label="Select row"
          />
        ) : null,
    }),
    columnHelper.display({
      id: "name",
      header: "Name",
      size: 360,
      cell: ({ row }) => {
        const r = row.original;
        return r.kind === "folder" ? (
          <span className="flex items-center gap-2 truncate font-medium">
            <FolderPlus className="size-4 shrink-0 text-bronze" /> {r.folder.name}
          </span>
        ) : (
          <span className="flex items-center gap-2 truncate font-medium">
            <FileText className="size-4 shrink-0 text-destructive" /> {r.doc.title}
          </span>
        );
      },
    }),
    columnHelper.display({
      id: "type",
      header: "Type",
      size: 90,
      cell: ({ row }) => {
        const r = row.original;
        return r.kind === "folder" ? (
          <span className="text-muted-foreground">Folder</span>
        ) : (
          <span className="text-muted-foreground uppercase">{r.doc.fileType}</span>
        );
      },
    }),
    columnHelper.display({
      id: "size",
      header: "Size",
      size: 90,
      cell: ({ row }) => {
        const r = row.original;
        return (
          <span className="text-muted-foreground">
            {r.kind === "doc" ? formatBytes(r.doc.sizeBytes) : "—"}
          </span>
        );
      },
    }),
    columnHelper.display({
      id: "version",
      header: "Version",
      size: 90,
      cell: ({ row }) =>
        row.original.kind === "doc" ? (
          <VersionChip n={1} />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    }),
    columnHelper.display({
      id: "created",
      header: "Created",
      size: 130,
      cell: ({ row }) => {
        const r = row.original;
        const date = r.kind === "folder" ? r.folder.createdAt : r.doc.createdAt;
        return <span className="text-muted-foreground">{formatShortDate(date)}</span>;
      },
    }),
    columnHelper.display({
      id: "status",
      header: "Status",
      size: 110,
      cell: ({ row }) =>
        row.original.kind === "doc" ? <DocStatusCue status={row.original.doc.status} /> : null,
    }),
    columnHelper.display({
      id: "actions",
      header: "",
      size: 64,
      enableResizing: false,
      meta: { noTruncate: true },
      cell: ({ row }) => {
        if (row.original.kind !== "doc" || !handlers.canEdit) return null;
        const doc = row.original.doc;
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground"
                    title="Document actions"
                    aria-label="Document actions"
                  />
                }
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52">
                {doc.status === "failed" && (
                  <DropdownMenuItem
                    className="whitespace-nowrap"
                    onClick={() => handlers.onReExtract(doc.id)}
                  >
                    <RotateCcw className="size-4" /> Re-extract
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="whitespace-nowrap"
                  onClick={() => handlers.onRename(doc)}
                >
                  <Pencil className="size-4" /> Rename document
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="whitespace-nowrap"
                  onClick={() => handlers.onDownload(doc.id)}
                >
                  <Download className="size-4" /> Download
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="whitespace-nowrap"
                  onClick={() => handlers.onUploadVersion(doc.id)}
                >
                  <Upload className="size-4" /> Upload new version
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  className="whitespace-nowrap"
                  onClick={() => handlers.onDelete(doc)}
                >
                  <Trash2 className="size-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    }),
  ];
}
