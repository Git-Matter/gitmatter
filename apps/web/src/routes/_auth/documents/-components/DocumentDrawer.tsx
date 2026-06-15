import { useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Download, ExternalLink, Pencil, RefreshCw, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CommitHistory } from "@/components/CommitHistory";
import { DocxView } from "./DocxView";
import { api, type DocVersion } from "../../../../lib/api";
import {
  documentSourceLabel,
  fileTypeLabel,
  hasExtensionChanged,
} from "../../../../lib/documentLabels";
import { formatBytes, formatDateTime } from "../../../../lib/format";

/**
 * Slide-in drawer with a document's preview + metadata + version history — a
 * quick peek from the documents table. The full redline/tracked-changes view
 * still lives on the standalone /documents/$id page (linked from here).
 *
 * Every mutation here (rename, replace, delete) records a commit on the audit
 * spine; the History section surfaces that papertrail in-panel.
 */
export function DocumentDrawer({ docId, onClose }: { docId: string | null; onClose: () => void }) {
  const open = docId !== null;
  const [width, setWidth] = useState(1000);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const onMove = (ev: MouseEvent) =>
      setWidth(Math.min(window.innerWidth * 0.96, Math.max(560, window.innerWidth - ev.clientX)));
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
    };
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-black/10 duration-150 supports-backdrop-filter:backdrop-blur-xs",
            "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
          )}
        />
        <DialogPrimitive.Popup
          style={{ width, maxWidth: "96vw" }}
          className={cn(
            "fixed inset-y-0 end-0 z-50 flex w-[96vw] flex-col bg-card text-foreground shadow-2xl duration-150 outline-none",
            "data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right"
          )}
        >
          {/* Drag the left edge to resize the drawer. */}
          <div
            onMouseDown={startResize}
            className="absolute inset-y-0 start-0 z-10 hidden w-1.5 cursor-col-resize transition-colors hover:bg-primary/40 lg:block"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize drawer"
          />
          {docId && <DrawerBody docId={docId} onClose={onClose} />}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

type PendingDelete = "doc" | { versionId: string; versionNumber: number } | null;

function DrawerBody({ docId, onClose }: { docId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [pane, setPane] = useState<"document" | "details">("document");
  const [previewTab, setPreviewTab] = useState<"rendered" | "text">("rendered");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);
  const [extWarnTitle, setExtWarnTitle] = useState<string | null>(null);

  const docKey = ["document", docId];
  const versionsKey = ["document-versions", docId];
  const historyKey = ["document-history", docId];
  const { data } = useQuery({ queryKey: docKey, queryFn: () => api.getDocumentDetail(docId) });
  const { data: versions = [] } = useQuery({
    queryKey: versionsKey,
    queryFn: () => api.listDocVersions(docId),
  });
  const { data: history = [] } = useQuery({
    queryKey: historyKey,
    queryFn: () => api.documentHistory(docId),
  });

  // Both the global documents list (["documents"]) and a matter's document list
  // (["matter-docs", …]) show these docs — refresh whichever is mounted.
  const invalidateLists = () =>
    qc.invalidateQueries({
      predicate: (q) =>
        Array.isArray(q.queryKey) &&
        (q.queryKey[0] === "documents" || q.queryKey[0] === "matter-docs"),
    });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: docKey });
    void qc.invalidateQueries({ queryKey: versionsKey });
    void qc.invalidateQueries({ queryKey: historyKey });
    void invalidateLists();
  };

  const renameMut = useMutation({
    mutationFn: (title: string) => api.renameDocument(docId, title),
    onSuccess: (updated) => {
      qc.setQueryData(docKey, updated);
      void qc.invalidateQueries({ queryKey: historyKey });
      void invalidateLists();
      setEditing(false);
      setExtWarnTitle(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Rename failed"),
  });

  const uploadMut = useMutation({
    mutationFn: (file: File) => api.uploadDocumentVersion(docId, file),
    onSuccess: () => {
      invalidate();
      toast.success("New version uploaded — extracting…");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed"),
  });

  const deleteVersionMut = useMutation({
    mutationFn: (versionId: string) => api.deleteDocVersion(docId, versionId),
    onSuccess: () => {
      invalidate();
      setPendingDelete(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const deleteDocMut = useMutation({
    mutationFn: () => api.deleteDocument(docId),
    onSuccess: () => {
      void invalidateLists();
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  if (!data) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-6">
        <Skeleton className="h-7 w-72" />
        <Skeleton className="min-h-0 w-full flex-1" />
      </div>
    );
  }

  const { document: doc } = data;
  const isDocx = doc.fileType === "docx" && !!doc.currentVersionId;
  const isPdf = doc.fileType.includes("pdf") && !!doc.currentVersionId;
  const hasRendered = isDocx || isPdf;
  const showRendered = hasRendered && previewTab === "rendered";
  const currentVersion = versions.find((v) => v.id === doc.currentVersionId);
  // Steer the version picker to the document's current family.
  const accept = doc.fileType.includes("pdf") ? ".pdf" : ".docx,.doc";

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) uploadMut.mutate(file);
  }

  function startRename() {
    setName(doc.title);
    setEditing(true);
  }

  function saveRename() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (hasExtensionChanged(doc.title, trimmed)) {
      setExtWarnTitle(trimmed);
      return;
    }
    renameMut.mutate(trimmed);
  }

  return (
    <>
      <input ref={fileRef} type="file" accept={accept} className="hidden" onChange={onPick} />

      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        {currentVersion && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
            V{currentVersion.versionNumber}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{doc.title}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            onClose();
            void router.navigate({ to: "/documents/$id", params: { id: docId } });
          }}
          title="Open full document"
        >
          <ExternalLink className="size-4" />
          Open full
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onClose} tooltip="Close">
          <X className="size-4" />
        </Button>
      </header>

      {/* Mobile pane switch — both panes show side-by-side from lg up. */}
      <div className="flex shrink-0 gap-1 border-b border-border p-2 lg:hidden">
        {(["document", "details"] as const).map((p) => (
          <Button
            key={p}
            variant={pane === p ? "secondary" : "ghost"}
            size="sm"
            className="flex-1 capitalize"
            onClick={() => setPane(p)}
          >
            {p}
          </Button>
        ))}
      </div>

      {/* minmax(0,1fr): let the preview shrink (it scrolls) instead of the
          fixed-width DOCX page forcing the grid wider than the panel and
          pushing the details column off-screen. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_clamp(280px,32%,360px)]">
        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-col border-border bg-muted/30 lg:border-e",
            pane !== "document" && "hidden lg:flex"
          )}
        >
          {/* Rendered file vs. extracted text. Text-only docs skip the tabs. */}
          {hasRendered && (
            <div className="flex shrink-0 gap-1 border-b border-border p-2">
              {(["rendered", "text"] as const).map((t) => (
                <Button
                  key={t}
                  variant={previewTab === t ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setPreviewTab(t)}
                >
                  {t === "rendered" ? "Document" : "Text"}
                </Button>
              ))}
            </div>
          )}
          {showRendered && isPdf ? (
            <iframe
              title={doc.title}
              src={`${api.documentDownloadUrl(docId)}?inline=1`}
              className="min-h-0 flex-1 border-0"
            />
          ) : (
            <ScrollArea className="min-h-0 flex-1">
              <div className="p-6">
                {showRendered && isDocx ? (
                  <DocxView
                    url={api.documentDownloadUrl(docId)}
                    versionToken={doc.currentVersionId}
                  />
                ) : doc.markdown ? (
                  <pre className="max-w-[70ch] font-serif text-base leading-relaxed whitespace-pre-wrap">
                    {doc.markdown}
                  </pre>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {doc.status === "ready"
                      ? "No text extracted."
                      : "Text is still being extracted…"}
                  </p>
                )}
              </div>
            </ScrollArea>
          )}
        </div>

        <div
          className={cn("flex min-h-0 min-w-0 flex-col", pane !== "details" && "hidden lg:flex")}
        >
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-6 p-4">
              <section className="flex flex-col gap-1.5">
                <h3 className="text-sm font-medium">Name</h3>
                {editing ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveRename();
                        if (e.key === "Escape") setEditing(false);
                      }}
                    />
                    <Button
                      size="sm"
                      disabled={!name.trim() || renameMut.isPending}
                      onClick={saveRename}
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm">{doc.title}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={startRename}
                      tooltip="Rename document"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  </div>
                )}
              </section>

              <section className="flex flex-col gap-1.5">
                <h3 className="text-sm font-medium">Document Data</h3>
                <dl className="rounded-md bg-muted/40 px-3 py-2">
                  <DataRow label="Type" value={fileTypeLabel(doc.fileType)} />
                  <DataRow label="Size" value={formatBytes(doc.sizeBytes)} />
                  <DataRow
                    label="Version"
                    value={currentVersion ? String(currentVersion.versionNumber) : "—"}
                  />
                  <DataRow label="Owner" value={doc.ownerName ?? "—"} />
                  <DataRow label="Uploaded" value={formatDateTime(doc.createdAt)} />
                  <DataRow
                    label="Pages"
                    value={doc.pageCount != null ? String(doc.pageCount) : "—"}
                  />
                </dl>
              </section>

              <section className="flex flex-col gap-1.5">
                <h3 className="text-sm font-medium">Versions</h3>
                <div className="flex flex-col gap-2">
                  {versions.map((v) => (
                    <VersionRow
                      key={v.id}
                      version={v}
                      isCurrent={v.id === doc.currentVersionId}
                      downloadUrl={api.versionDownloadUrl(docId, v.id)}
                      onReplace={() => fileRef.current?.click()}
                      onDelete={() =>
                        setPendingDelete({ versionId: v.id, versionNumber: v.versionNumber })
                      }
                    />
                  ))}
                </div>
              </section>

              <section className="flex flex-col gap-1.5">
                <h3 className="text-sm font-medium">History</h3>
                <CommitHistory commits={history} />
              </section>
            </div>
          </ScrollArea>

          <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border p-4">
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteDocMut.isPending}
              onClick={() => setPendingDelete("doc")}
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
            <Button
              size="sm"
              disabled={uploadMut.isPending}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="size-4" />
              {uploadMut.isPending ? "Uploading…" : "Upload new version"}
            </Button>
          </footer>
        </div>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(next) => !next && setPendingDelete(null)}
        title={pendingDelete === "doc" ? "Delete document?" : "Delete version?"}
        description={
          pendingDelete === "doc"
            ? "This removes the document and all its versions and history. This cannot be undone."
            : "This permanently purges the stored file for this version. The version stays in history as deleted."
        }
        confirmLabel="Delete"
        pending={deleteDocMut.isPending || deleteVersionMut.isPending}
        onConfirm={() => {
          if (pendingDelete === "doc") deleteDocMut.mutate();
          else if (pendingDelete) deleteVersionMut.mutate(pendingDelete.versionId);
        }}
      />

      <ConfirmDialog
        open={extWarnTitle !== null}
        onOpenChange={(next) => !next && setExtWarnTitle(null)}
        title="Change file extension?"
        description={`Renaming changes the file extension. The stored file type stays ${fileTypeLabel(doc.fileType)} — only the displayed name changes.`}
        confirmLabel="Rename anyway"
        pending={renameMut.isPending}
        onConfirm={() => extWarnTitle && renameMut.mutate(extWarnTitle)}
      />
    </>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] items-baseline gap-3 py-1 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  );
}

function VersionRow({
  version,
  isCurrent,
  downloadUrl,
  onReplace,
  onDelete,
}: {
  version: DocVersion;
  isCurrent: boolean;
  downloadUrl: string;
  onReplace: () => void;
  onDelete: () => void;
}) {
  const deleted = !!version.deletedAt;
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border border-border px-3 py-2",
        isCurrent && "border-primary/40 bg-primary/5",
        deleted && "opacity-60"
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Version {version.versionNumber}</span>
          <span className="text-xs font-medium text-muted-foreground uppercase">
            {fileTypeLabel(version.fileType)}
          </span>
          {deleted && <span className="text-xs text-muted-foreground">· Deleted</span>}
        </div>
        <p className="text-xs text-muted-foreground">
          {documentSourceLabel(version.source)} · {formatDateTime(version.createdAt)}
        </p>
      </div>
      {!deleted && (
        <Button
          variant="ghost"
          size="icon-sm"
          tooltip="Download version"
          nativeButton={false}
          render={<a href={downloadUrl} download />}
        >
          <Download className="size-3.5" />
        </Button>
      )}
      {isCurrent && !deleted && (
        <Button variant="ghost" size="icon-sm" tooltip="Replace active file" onClick={onReplace}>
          <RefreshCw className="size-3.5" />
        </Button>
      )}
      {!isCurrent && !deleted && (
        <Button variant="ghost" size="icon-sm" tooltip="Delete version" onClick={onDelete}>
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
