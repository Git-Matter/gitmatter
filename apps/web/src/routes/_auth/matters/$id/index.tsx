import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { FolderPlus, MessageSquarePlus, Pencil, Plus, TableProperties, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { TableSearch } from "@/components/TableSearch";
import { ToolbarTabs } from "@/components/ToolbarTabs";
import { PeopleModal } from "@/routes/_auth/matters/-components/PeopleModal";
import { EditMatterModal } from "@/routes/_auth/matters/-components/EditMatterModal";
import { AddDocumentsModal } from "@/routes/_auth/matters/-components/AddDocumentsModal";
import {
  matterDocumentColumns,
  type DocRow,
} from "@/routes/_auth/matters/-components/matterDocumentColumns";
import { DocumentDrawer } from "@/routes/_auth/documents/-components/DocumentDrawer";
import { api, type ChatSummary, type Doc, type Folder } from "@/lib/data/api";
import { useChats } from "@/lib/data/queries";
import { useDataTable } from "@/lib/hooks/table/useDataTable";
import { useSession } from "@/lib/auth/auth-client";
import { useMatters } from "@/lib/context/matters-context";
import { formatShortDate } from "@/lib/format/format";

export const Route = createFileRoute("/_auth/matters/$id/")({ component: MatterWorkspace });

type Tab = "documents" | "chats" | "reviews";

function MatterWorkspace() {
  const { id } = useParams({ from: "/_auth/matters/$id/" });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const { refresh: refreshMatters, setCurrent } = useMatters();
  const [tab, setTab] = useState<Tab>("documents");
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // New Review files under this matter — set it working, then route out.
  const openInMatter = (to: "/reviews") => {
    setCurrent(id);
    void navigate({ to });
  };
  // New Chat opens the matter's own 3-pane assistant workspace.
  const openMatterChat = () => void navigate({ to: "/matters/$id/assistant", params: { id } });

  const { data: matter, isError: notFound } = useQuery({
    queryKey: ["matter", id],
    queryFn: () => api.getMatter(id),
  });
  const { data: members = [] } = useQuery({
    queryKey: ["matter-people", id],
    queryFn: () => api.getMatterPeople(id),
  });

  const onMatterChanged = () => {
    void qc.invalidateQueries({ queryKey: ["matter", id] });
    refreshMatters();
  };

  if (notFound)
    return (
      <p className="text-muted-foreground">
        Matter not found, or you don't have access.{" "}
        <Link to="/matters" className="underline">
          Back to matters
        </Link>
      </p>
    );
  if (!matter) return null;

  const myRole = members.find((m) => m.userId === session?.user.id)?.role;
  const isOwner = myRole === "owner";

  return (
    <PageShell
      mode="fill"
      bodyClassName="gap-stack"
      header={
        /* mike Image #1: inline "Matters › Name" trail + two action groups —
           a frosted icon pill (search / people / …) and New Chat / New Review. */
        <PageHeader
          breadcrumbs={[{ label: "Matters", to: "/matters" }, { label: matter.name }]}
          actions={[
            <div key="icons" className="flex items-center gap-0.5 rounded-full glass-panel p-1">
              <Button
                variant="ghost"
                size="icon-sm"
                title="People"
                aria-label="People"
                onClick={() => setPeopleOpen(true)}
              >
                <Users className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                title="Edit matter"
                aria-label="Edit matter"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="size-4" />
              </Button>
            </div>,
            <div key="create" className="flex items-center gap-0.5 rounded-full glass-panel p-1">
              <Button
                variant="ghost"
                size="icon-sm"
                title="New chat"
                aria-label="New chat"
                onClick={openMatterChat}
              >
                <MessageSquarePlus className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                title="New review"
                aria-label="New review"
                onClick={() => openInMatter("/reviews")}
              >
                <TableProperties className="size-4" />
              </Button>
            </div>,
          ]}
        />
      }
    >
      <ToolbarTabs
        tabs={[
          { id: "documents" as const, label: "Documents" },
          { id: "chats" as const, label: "Assistant Chats" },
          { id: "reviews" as const, label: "Tabular Reviews" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "documents" && <DocumentsTab matterId={id} canEdit={myRole !== "viewer"} />}
      {tab === "chats" && <ChatsTab matterId={id} />}
      {tab === "reviews" && <ReviewsTab matterId={id} />}

      <PeopleModal
        matterId={id}
        matterName={matter.name}
        canManage={isOwner}
        open={peopleOpen}
        onOpenChange={setPeopleOpen}
      />

      <EditMatterModal
        matter={matter}
        open={editOpen}
        onOpenChange={setEditOpen}
        canClose={isOwner}
        onSaved={onMatterChanged}
      />
    </PageShell>
  );
}

function DocumentsTab({ matterId, canEdit }: { matterId: string; canEdit: boolean }) {
  // See Documents/Reviews: React Compiler can't track the stable TanStack table's
  // in-place data changes, so it skips the re-render that fills the table. Opt out.
  "use no memo";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [rowSelection, setRowSelection] = useState({});
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Upload-new-version targets a specific document; one hidden input, target id
  // captured when the menu item is clicked.
  const versionInputRef = useRef<HTMLInputElement>(null);
  const versionTargetId = useRef<string | null>(null);

  const { data: folders = [] } = useQuery({
    queryKey: ["folders", matterId],
    queryFn: () => api.listFolders(matterId),
  });
  const { data: docs = [] } = useQuery({
    queryKey: ["matter-docs", matterId, folderId],
    queryFn: () => api.listMatterDocuments(matterId, folderId),
    // Auto-advance rows while extraction runs (Queued/Extracting -> Ready/Failed)
    // without polling once everything has settled.
    refetchInterval: (q) =>
      q.state.data?.some((d) => d.status === "pending" || d.status === "processing") ? 2000 : false,
  });

  const invalidateDocs = () =>
    qc.invalidateQueries({ queryKey: ["matter-docs", matterId, folderId] });

  const uploadDoc = useMutation({
    mutationFn: (file: File) => api.uploadDocument(file, undefined, matterId, folderId),
    onSuccess: () => {
      toast.success("Uploaded");
      void invalidateDocs();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed"),
  });

  const addFolderMut = useMutation({
    mutationFn: (name: string) => api.createFolder(matterId, name, folderId),
    onSuccess: () => {
      toast.success("Folder added");
      void qc.invalidateQueries({ queryKey: ["folders", matterId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const renameDoc = useMutation({
    mutationFn: (v: { id: string; title: string }) => api.renameDocument(v.id, v.title),
    onSuccess: () => {
      toast.success("Renamed");
      void invalidateDocs();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Rename failed"),
  });

  const uploadVersion = useMutation({
    mutationFn: (v: { id: string; file: File }) => api.uploadDocumentVersion(v.id, v.file),
    onSuccess: () => {
      toast.success("New version uploaded — extracting…");
      void invalidateDocs();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed"),
  });

  const deleteDoc = useMutation({
    mutationFn: (id: string) => api.deleteDocument(id),
    onSuccess: () => {
      toast.success("Document deleted");
      void invalidateDocs();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const retryExtract = useMutation({
    mutationFn: (id: string) => api.retryDocument(id),
    onSuccess: () => {
      toast.success("Re-extracting…");
      void invalidateDocs();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Re-extract failed"),
  });

  const rootFolders = folders.filter((f: Folder) => f.parentFolderId === (folderId ?? null));
  const filtered = docs.filter((d: Doc) => d.title.toLowerCase().includes(search.toLowerCase()));
  const current = folders.find((f) => f.id === folderId) ?? null;

  // Folders first, then docs — one combined data-table row model.
  const rows: DocRow[] = [
    ...rootFolders.map((folder): DocRow => ({ kind: "folder", id: `folder:${folder.id}`, folder })),
    ...filtered.map((doc): DocRow => ({ kind: "doc", id: `doc:${doc.id}`, doc })),
  ];

  const columns = useMemo(
    () =>
      matterDocumentColumns({
        canEdit,
        onReExtract: (id) => retryExtract.mutate(id),
        onRename: (doc) => {
          const name = window.prompt("Rename document", doc.title);
          if (name?.trim() && name.trim() !== doc.title)
            renameDoc.mutate({ id: doc.id, title: name.trim() });
        },
        onDownload: (id) => {
          window.location.href = api.documentDownloadUrl(id);
        },
        onUploadVersion: (id) => {
          versionTargetId.current = id;
          versionInputRef.current?.click();
        },
        onDelete: (doc) => {
          if (window.confirm(`Delete "${doc.title}"? This can be undone within 30 days.`))
            deleteDoc.mutate(doc.id);
        },
      }),
    [canEdit, retryExtract, renameDoc, deleteDoc]
  );

  const { table } = useDataTable({
    mode: "client",
    columns,
    data: rows,
    getRowId: (row) => row.id,
    enableSorting: false,
    rowSelection,
    onRowSelectionChange: setRowSelection,
  });
  const selectedCount = table.getSelectedRowModel().rows.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-stack">
      {/* Table toolbar (shadcn data-table pattern): filter on the left,
          document-table-specific actions on the right. */}
      <div className="flex shrink-0 items-center justify-between gap-3">
        <TableSearch value={search} onChange={setSearch} placeholder="Filter documents…" />
        {canEdit && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              title="Add subfolder"
              aria-label="Add subfolder"
              onClick={() => {
                const name = window.prompt("Folder name");
                if (name?.trim()) addFolderMut.mutate(name.trim());
              }}
            >
              <FolderPlus className="size-4" />
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" /> Add
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.doc"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadDoc.mutate(f);
                e.target.value = "";
              }}
            />
          </div>
        )}
      </div>

      <AddDocumentsModal
        matterId={matterId}
        open={addOpen}
        onOpenChange={setAddOpen}
        existingIds={docs.map((d) => d.id)}
        onLinked={invalidateDocs}
        onUploadNew={() => fileRef.current?.click()}
      />

      {/* Folder breadcrumb only when inside a subfolder (root needs no chrome). */}
      {current && (
        <div className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
          <button onClick={() => setFolderId(null)} className="hover:text-foreground">
            All documents
          </button>
          <span className="text-border">›</span>
          <span className="text-foreground">{current.name}</span>
        </div>
      )}

      <input
        ref={versionInputRef}
        type="file"
        accept=".pdf,.docx,.doc"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          const id = versionTargetId.current;
          if (f && id) uploadVersion.mutate({ id, file: f });
          e.target.value = "";
          versionTargetId.current = null;
        }}
      />

      <DataTable
        table={table}
        empty={`No documents yet.${canEdit ? " Add documents to get started." : ""}`}
        onRowClick={(r) =>
          r.kind === "folder" ? setFolderId(r.folder.id) : setPreviewId(r.doc.id)
        }
      />

      {/* Selection footer (shadcn data-table pattern). */}
      <div className="shrink-0 text-sm text-muted-foreground">
        {selectedCount} of {rows.length} row(s) selected.
      </div>

      <DocumentDrawer docId={previewId} onClose={() => setPreviewId(null)} />
    </div>
  );
}

const chatHelper = createColumnHelper<ChatSummary>();
const chatColumns = [
  chatHelper.accessor((ch) => ch.title || "Untitled chat", {
    id: "title",
    header: "Title",
    size: 360,
    cell: (c) => <span className="block truncate font-medium">{c.getValue()}</span>,
  }),
  chatHelper.accessor("updatedAt", {
    id: "updatedAt",
    header: "Updated",
    size: 160,
    cell: (c) => <span className="text-muted-foreground">{formatShortDate(c.getValue())}</span>,
  }),
];

function ChatsTab({ matterId }: { matterId: string }) {
  // See Documents tab: opt out of React Compiler memoization for the DataTable.
  "use no memo";
  const navigate = useNavigate();
  const { data: chats = [] } = useChats(matterId);
  const [search, setSearch] = useState("");

  const startChat = () => void navigate({ to: "/matters/$id/assistant", params: { id: matterId } });

  const filtered = chats.filter((ch) =>
    (ch.title || "Untitled chat").toLowerCase().includes(search.toLowerCase())
  );

  const { table } = useDataTable({
    mode: "client",
    columns: chatColumns,
    data: filtered,
    getRowId: (row) => row.id,
    defaultSorting: [{ id: "updatedAt", desc: true }],
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-stack">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <TableSearch value={search} onChange={setSearch} placeholder="Filter chats…" />
        <Button size="sm" onClick={startChat}>
          <MessageSquarePlus className="size-4" /> New Chat
        </Button>
      </div>

      <DataTable
        table={table}
        empty="No chats yet."
        onRowClick={(ch) =>
          navigate({
            to: "/matters/$id/assistant/$chatId",
            params: { id: matterId, chatId: ch.id },
          })
        }
      />
    </div>
  );
}

type ReviewRow = { id: string; title: string; documentIds: string[]; createdAt: string };
const reviewHelper = createColumnHelper<ReviewRow>();
const reviewColumns = [
  reviewHelper.accessor((r) => r.title || "Untitled review", {
    id: "title",
    header: "Title",
    size: 360,
    cell: (c) => <span className="block truncate font-medium">{c.getValue()}</span>,
  }),
  reviewHelper.accessor("createdAt", {
    id: "createdAt",
    header: "Created",
    size: 160,
    cell: (c) => <span className="text-muted-foreground">{formatShortDate(c.getValue())}</span>,
  }),
];

function ReviewsTab({ matterId }: { matterId: string }) {
  // See Documents tab: opt out of React Compiler memoization for the DataTable.
  "use no memo";
  const navigate = useNavigate();
  const { setCurrent } = useMatters();
  const { data: reviews = [] } = useQuery({
    queryKey: ["reviews"],
    queryFn: () => api.listReviews(),
  });

  const [search, setSearch] = useState("");

  const newReview = () => {
    setCurrent(matterId);
    void navigate({ to: "/reviews" });
  };

  const filtered = reviews.filter((r) =>
    (r.title || "Untitled review").toLowerCase().includes(search.toLowerCase())
  );

  const { table } = useDataTable({
    mode: "client",
    columns: reviewColumns,
    data: filtered,
    getRowId: (row) => row.id,
    defaultSorting: [{ id: "createdAt", desc: true }],
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-stack">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <TableSearch value={search} onChange={setSearch} placeholder="Filter reviews…" />
        <Button size="sm" onClick={newReview}>
          <TableProperties className="size-4" /> New Review
        </Button>
      </div>

      <DataTable
        table={table}
        empty="No reviews yet."
        onRowClick={(r) => navigate({ to: "/reviews/$id", params: { id: r.id } })}
      />
    </div>
  );
}
