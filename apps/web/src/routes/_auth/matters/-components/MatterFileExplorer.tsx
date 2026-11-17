import { captureActionOrigin, notifySuccess } from "@/lib/feedback";
import { Input } from "@/components/ui/input";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Folder as FolderIcon,
  FolderOpen,
  FolderPlus,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/util/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api, type Doc, type Folder } from "../../../../lib/data/api";

type ContextMenuState = {
  x: number;
  y: number;
  parentId: string | null;
};

/**
 * Left pane of the matter workspace — a navigable file explorer over the
 * matter's folders and documents. Folders nest in a recursive expand/collapse
 * tree; clicking a document opens it in the center viewer. Uploads and new
 * folders land in the currently selected folder (or the root when none is).
 */
export function MatterFileExplorer({
  matterId,
  canEdit,
  selectedDocId,
  onOpenDoc,
  onCollapse,
}: {
  matterId: string;
  canEdit: boolean;
  selectedDocId: string | null;
  onOpenDoc: (doc: Doc) => void;
  onCollapse: () => void;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [creatingIn, setCreatingIn] = useState<string | null | undefined>(undefined);
  const [newFolderName, setNewFolderName] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const { data: folders = [] } = useQuery({
    queryKey: ["folders", matterId],
    queryFn: () => api.listFolders(matterId),
  });
  const { data: docs = [] } = useQuery({
    queryKey: ["matter-docs", matterId, "all"],
    queryFn: () => api.listMatterDocuments(matterId),
    refetchInterval: (q) =>
      q.state.data?.some((d) => d.status === "pending" || d.status === "processing") ? 2000 : false,
  });

  // Close the context menu on any outside click.
  useEffect(() => {
    if (!contextMenu) return;
    function handle(e: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [contextMenu]);

  const upload = useMutation({
    onMutate: () => captureActionOrigin(),
    mutationFn: (file: File) => api.uploadDocument(file, undefined, matterId, selectedFolderId),
    onSuccess: (_data, _variables, origin) => {
      notifySuccess("Uploaded — extracting…", origin);
      void qc.invalidateQueries({ queryKey: ["matter-docs", matterId, "all"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed"),
  });

  // Optimistic folder creation: the new folder shows in the tree immediately
  // (temp id), its parent auto-expands, then the server row replaces it.
  const addFolder = useMutation({
    mutationFn: ({ parentId, name }: { parentId: string | null; name: string }) =>
      api.createFolder(matterId, name, parentId),
    onMutate: async ({ parentId, name }) => {
      await qc.cancelQueries({ queryKey: ["folders", matterId] });
      const prev = qc.getQueryData<Folder[]>(["folders", matterId]) ?? [];
      const optimistic: Folder = {
        id: `temp-${crypto.randomUUID()}`,
        matterId,
        parentFolderId: parentId,
        name,
        createdAt: new Date().toISOString(),
      };
      qc.setQueryData<Folder[]>(["folders", matterId], [...prev, optimistic]);
      if (parentId) setExpandedIds((s) => new Set([...s, parentId]));
      return { prev };
    },
    onError: (e, _vars, ctx) => {
      if (ctx) qc.setQueryData(["folders", matterId], ctx.prev);
      toast.error(e instanceof Error ? e.message : "Failed to add folder");
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["folders", matterId] }),
  });

  function toggleFolder(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function commitNewFolder(parentId: string | null) {
    const name = newFolderName.trim();
    // Empty name → leave the input mounted; users dismiss with Escape. Guards
    // against a StrictMode blur firing on the freshly-mounted input.
    if (!name) return;
    setCreatingIn(undefined);
    setNewFolderName("");
    addFolder.mutate({ parentId, name });
  }

  function startCreating(parentId: string | null) {
    if (parentId) setExpandedIds((s) => new Set([...s, parentId]));
    setCreatingIn(parentId);
    setNewFolderName("");
  }

  const empty = !folders.length && !docs.length && creatingIn === undefined;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-xs text-muted-foreground">Explorer</span>
        <div className="flex items-center gap-0.5">
          {canEdit && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.doc"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload.mutate(f);
                  e.target.value = "";
                }}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                tooltip="Add subfolder"
                onClick={() => startCreating(selectedFolderId)}
              >
                <FolderPlus className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                tooltip="Upload documents"
                disabled={upload.isPending}
                onClick={() => fileRef.current?.click()}
              >
                {upload.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Upload className="size-3.5" />
                )}
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon-sm" tooltip="Collapse explorer" onClick={onCollapse}>
            <ChevronLeft className="size-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div
          className="flex flex-col py-1"
          onContextMenu={(e) => {
            if (!canEdit) return;
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY, parentId: null });
          }}
        >
          <MatterTree
            folders={folders}
            docs={docs}
            parentId={null}
            depth={1}
            canEdit={canEdit}
            expandedIds={expandedIds}
            selectedFolderId={selectedFolderId}
            selectedDocId={selectedDocId}
            creatingIn={creatingIn}
            newFolderName={newFolderName}
            onOpenDoc={onOpenDoc}
            onSelectFolder={setSelectedFolderId}
            onToggleFolder={toggleFolder}
            onStartContextMenu={setContextMenu}
            onNameChange={setNewFolderName}
            onCommitNewFolder={commitNewFolder}
            onCancelNewFolder={() => {
              setCreatingIn(undefined);
              setNewFolderName("");
            }}
          />
          {empty && (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">No documents yet.</p>
          )}
        </div>
      </ScrollArea>

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 w-44 overflow-hidden rounded-md border border-border bg-popover py-1 text-sm shadow-md"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/50"
            onClick={() => {
              const parentId = contextMenu.parentId;
              setContextMenu(null);
              startCreating(parentId);
            }}
          >
            <FolderPlus className="size-3.5 text-muted-foreground" />
            New subfolder
          </button>
        </div>
      )}
    </div>
  );
}

function MatterTree({
  folders,
  docs,
  parentId,
  depth,
  canEdit,
  expandedIds,
  selectedFolderId,
  selectedDocId,
  creatingIn,
  newFolderName,
  onOpenDoc,
  onSelectFolder,
  onToggleFolder,
  onStartContextMenu,
  onNameChange,
  onCommitNewFolder,
  onCancelNewFolder,
}: {
  folders: Folder[];
  docs: Doc[];
  parentId: string | null;
  depth: number;
  canEdit: boolean;
  expandedIds: Set<string>;
  selectedFolderId: string | null;
  selectedDocId: string | null;
  creatingIn: string | null | undefined;
  newFolderName: string;
  onOpenDoc: (doc: Doc) => void;
  onSelectFolder: (folderId: string) => void;
  onToggleFolder: (folderId: string) => void;
  onStartContextMenu: (state: ContextMenuState) => void;
  onNameChange: (name: string) => void;
  onCommitNewFolder: (parentId: string | null) => void;
  onCancelNewFolder: () => void;
}) {
  const padding = getTreePadding(depth);
  const childFolders = getChildFolders(folders, parentId);
  const childDocs = docs.filter((doc) => doc.folderId === parentId);

  return (
    <>
      {creatingIn === parentId ? (
        <NewFolderRow
          parentId={parentId}
          padding={padding}
          name={newFolderName}
          onNameChange={onNameChange}
          onCommit={onCommitNewFolder}
          onCancel={onCancelNewFolder}
        />
      ) : null}

      {childFolders.map((folder) => {
        const expanded = expandedIds.has(folder.id);
        return (
          <div key={folder.id}>
            <FolderRow
              folder={folder}
              padding={padding}
              canEdit={canEdit}
              expanded={expanded}
              selected={selectedFolderId === folder.id}
              onSelect={onSelectFolder}
              onToggle={onToggleFolder}
              onStartContextMenu={onStartContextMenu}
            />
            {expanded ? (
              <MatterTree
                folders={folders}
                docs={docs}
                parentId={folder.id}
                depth={depth + 1}
                canEdit={canEdit}
                expandedIds={expandedIds}
                selectedFolderId={selectedFolderId}
                selectedDocId={selectedDocId}
                creatingIn={creatingIn}
                newFolderName={newFolderName}
                onOpenDoc={onOpenDoc}
                onSelectFolder={onSelectFolder}
                onToggleFolder={onToggleFolder}
                onStartContextMenu={onStartContextMenu}
                onNameChange={onNameChange}
                onCommitNewFolder={onCommitNewFolder}
                onCancelNewFolder={onCancelNewFolder}
              />
            ) : null}
          </div>
        );
      })}

      {childDocs.map((doc) => (
        <DocumentRow
          key={doc.id}
          doc={doc}
          padding={padding + 18}
          selected={selectedDocId === doc.id}
          onOpen={onOpenDoc}
        />
      ))}
    </>
  );
}

function getTreePadding(depth: number) {
  return 12 + (depth - 1) * 16;
}

function getChildFolders(folders: Folder[], parentId: string | null) {
  return folders
    .filter((folder) => folder.parentFolderId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function NewFolderRow({
  parentId,
  padding,
  name,
  onNameChange,
  onCommit,
  onCancel,
}: {
  parentId: string | null;
  padding: number;
  name: string;
  onNameChange: (name: string) => void;
  onCommit: (parentId: string | null) => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 py-1.5 pe-2" style={{ paddingInlineStart: padding }}>
      <ChevronRight className="size-3 shrink-0 text-muted-foreground/50" />
      <FolderPlus className="size-3.5 shrink-0 text-bronze" />
      <Input
        autoFocus
        className="min-w-0 flex-1 border-b border-border bg-transparent text-sm outline-none"
        placeholder="Folder name"
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onCommit(parentId);
          if (event.key === "Escape") onCancel();
        }}
        onBlur={() => onCommit(parentId)}
      />
    </div>
  );
}

function FolderRow({
  folder,
  padding,
  canEdit,
  expanded,
  selected,
  onSelect,
  onToggle,
  onStartContextMenu,
}: {
  folder: Folder;
  padding: number;
  canEdit: boolean;
  expanded: boolean;
  selected: boolean;
  onSelect: (folderId: string) => void;
  onToggle: (folderId: string) => void;
  onStartContextMenu: (state: ContextMenuState) => void;
}) {
  const ChevronIcon = expanded ? ChevronDown : ChevronRight;
  const FolderGlyph = expanded ? FolderOpen : FolderIcon;

  return (
    <button
      type="button"
      onClick={() => {
        onSelect(folder.id);
        onToggle(folder.id);
      }}
      onContextMenu={(event) => {
        if (!canEdit) return;
        event.preventDefault();
        event.stopPropagation();
        onStartContextMenu({ x: event.clientX, y: event.clientY, parentId: folder.id });
      }}
      className={cn(
        "flex w-full items-center gap-1.5 py-1.5 pe-2 text-left text-sm hover:bg-muted/50",
        selected && "bg-muted/60"
      )}
      style={{ paddingInlineStart: padding }}
    >
      <ChevronIcon className="size-3 shrink-0 text-muted-foreground" />
      <FolderGlyph className="size-4 shrink-0 text-bronze" />
      <span className="truncate">{folder.name}</span>
    </button>
  );
}

function DocumentRow({
  doc,
  padding,
  selected,
  onOpen,
}: {
  doc: Doc;
  padding: number;
  selected: boolean;
  onOpen: (doc: Doc) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(doc)}
      className={cn(
        "flex w-full items-center gap-2 py-1.5 pe-3 text-left text-sm hover:bg-muted/50",
        selected && "bg-muted"
      )}
      style={{ paddingInlineStart: padding }}
    >
      <FileText className="size-4 shrink-0 text-destructive" />
      <span className="min-w-0 flex-1 truncate">{doc.title}</span>
      {isDocProcessing(doc) ? (
        <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
      ) : null}
    </button>
  );
}

function isDocProcessing(doc: Doc) {
  return doc.status === "pending" || doc.status === "processing";
}
