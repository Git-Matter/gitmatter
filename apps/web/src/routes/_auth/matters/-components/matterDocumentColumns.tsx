import { Input } from "@/components/ui/input";
import { useState } from "react";
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
// rows carry the full document affordances, and a transient "new-folder" row
// renders the inline create-folder input (mirrors MatterFileExplorer's tree).
export type DocRow =
  | { kind: "folder"; id: string; folder: Folder }
  | { kind: "doc"; id: string; doc: Doc }
  | { kind: "new-folder"; id: string };

// Self-contained so the column set doesn't rebuild on every keystroke: the draft
// name lives here, and only commit/cancel cross back out. Enter commits, Escape
// cancels, blur commits a non-empty name.
function NewFolderInput({
  onCommit,
  onCancel,
}: {
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const commit = () => (name.trim() ? onCommit(name.trim()) : onCancel());
  return (
    <span className="flex items-center gap-2">
      <FolderPlus className="size-4 shrink-0 text-bronze" />
      <Input
        autoFocus
        className="min-w-0 flex-1 border-b border-border bg-transparent text-sm font-medium outline-none"
        placeholder="Folder name"
        value={name}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") onCancel();
        }}
        onBlur={commit}
      />
    </span>
  );
}

export function DocStatusCue({ status }: { status: Doc["status"] }) {
  if (status === "ready") return <span className="text-muted-foreground">Ready</span>;
  if (status === "failed")
    return <span className="text-xs font-medium text-destructive">Failed</span>;
  return <StateCue tone="bronze">{status === "processing" ? "Extracting" : "Queued"}</StateCue>;
}

const columnHelper = createColumnHelper<DocRow>();

export function matterDocumentColumns(handlers: {
  onOpen: (row: DocRow) => void;
  canEdit: boolean;
  onReExtract: (id: string) => void;
  onRename: (doc: Doc) => void;
  onDownload: (id: string) => void;
  onUploadVersion: (id: string) => void;
  onDelete: (doc: Doc) => void;
  onCreateFolderCommit: (name: string) => void;
  onCreateFolderCancel: () => void;
}) {
  return [
    columnHelper.display({
      id: "select",
      size: 44,
      enableResizing: false,
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllRowsSelected()}
          indeterminate={table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()}
          onCheckedChange={(checked) => table.toggleAllRowsSelected(checked)}
          aria-label="Select all rows on this page"
        />
      ),
      cell: ({ row }) =>
        row.original.kind === "doc" ? (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(checked)}
            onClick={(e) => e.stopPropagation()}
            aria-label="Select row"
          />
        ) : null,
    }),
    // accessor (not display) so the header is sortable — TanStack only enables
    // sorting on columns with an accessorFn. sortingFn returns a constant so
    // TanStack never reorders: the route sorts the doc rows itself and keeps
    // folders + the new-folder input pinned on top.
    columnHelper.accessor((r) => (r.kind === "doc" ? r.doc.title : ""), {
      id: "name",
      header: "Name",
      size: 360,
      sortingFn: () => 0,
      cell: ({ row }) => {
        const r = row.original;
        if (r.kind === "new-folder")
          return (
            <NewFolderInput
              onCommit={handlers.onCreateFolderCommit}
              onCancel={handlers.onCreateFolderCancel}
            />
          );
        const content =
          r.kind === "folder" ? (
            <span className="flex items-center gap-2 truncate font-medium">
              <FolderPlus className="size-4 shrink-0 text-bronze" /> {r.folder.name}
            </span>
          ) : (
            <span className="flex items-center gap-2 truncate font-medium">
              <FileText className="size-4 shrink-0 text-destructive" /> {r.doc.title}
            </span>
          );
        return (
          <Button
            variant="link"
            className="h-auto min-h-6 max-w-full justify-start p-0"
            onClick={(event) => {
              event.stopPropagation();
              handlers.onOpen(r);
            }}
          >
            {content}
          </Button>
        );
      },
    }),
    columnHelper.accessor((r) => (r.kind === "doc" ? r.doc.fileType : ""), {
      id: "type",
      header: "Type",
      size: 90,
      sortingFn: () => 0,
      cell: ({ row }) => {
        const r = row.original;
        if (r.kind === "new-folder") return null;
        return r.kind === "folder" ? (
          <span className="text-muted-foreground">Folder</span>
        ) : (
          <span className="text-muted-foreground uppercase">{r.doc.fileType}</span>
        );
      },
    }),
    columnHelper.accessor((r) => (r.kind === "doc" ? (r.doc.sizeBytes ?? 0) : 0), {
      id: "size",
      header: "Size",
      size: 90,
      sortingFn: () => 0,
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
    columnHelper.accessor((r) => (r.kind === "doc" ? r.doc.createdAt : ""), {
      id: "created",
      header: "Created",
      size: 130,
      sortingFn: () => 0,
      cell: ({ row }) => {
        const r = row.original;
        if (r.kind === "new-folder") return null;
        const date = r.kind === "folder" ? r.folder.createdAt : r.doc.createdAt;
        return <span className="text-muted-foreground">{formatShortDate(date)}</span>;
      },
    }),
    columnHelper.accessor((r) => (r.kind === "doc" ? r.doc.status : ""), {
      id: "status",
      header: "Status",
      size: 110,
      sortingFn: () => 0,
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
