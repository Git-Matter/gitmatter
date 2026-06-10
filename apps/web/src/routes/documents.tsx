import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { api, type Doc } from "../lib/api";
import { useWorkingMatterId } from "../lib/matters-context";

export const Route = createFileRoute("/documents")({ component: Documents });

function Documents() {
  const matterId = useWorkingMatterId();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [title, setTitle] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const refresh = () =>
    api
      .listDocuments()
      .then(setDocs)
      .catch(() => {});
  useEffect(() => {
    void refresh();
  }, []);

  // Extraction runs in a background worker; poll while anything is in flight.
  const inFlight = docs.some((d) => d.status === "pending" || d.status === "processing");
  useEffect(() => {
    if (!inFlight) return;
    const id = setInterval(() => void refresh(), 2000);
    return () => clearInterval(id);
  }, [inFlight]);

  async function retry(id: string) {
    try {
      await api.retryDocument(id);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Retry failed");
    }
  }

  async function create() {
    if (!title.trim() || !markdown.trim()) return;
    setBusy(true);
    try {
      await api.createDocument({ title: title.trim(), markdown, matterId });
      setTitle("");
      setMarkdown("");
      await refresh();
      toast.success("Document added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setUploading(true);
    try {
      await api.uploadDocument(file, undefined, matterId);
      await refresh();
      toast.success(`Uploaded ${file.name} — extracting…`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-section">
      <PageHeader
        title="Documents"
        description="Upload or paste source documents. Text is extracted to markdown for review and chat."
      />
      <div className="grid gap-stack md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Add document</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5 rounded-md border border-dashed p-3">
              <Label htmlFor="file">Upload PDF or DOCX</Label>
              <input
                id="file"
                type="file"
                accept=".pdf,.docx,.doc"
                disabled={uploading}
                onChange={onUpload}
                className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:text-primary-foreground"
              />
              <p className="text-xs text-muted-foreground">
                {uploading ? "Extracting…" : "Text is extracted to markdown for review and chat."}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">Or paste text / markdown directly:</p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="NDA.md"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="md">Content</Label>
              <Textarea
                id="md"
                rows={10}
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
              />
            </div>
            <Button
              onClick={create}
              disabled={busy || !title.trim() || !markdown.trim()}
              className="self-start"
            >
              {busy ? "Adding…" : "Add document"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your documents ({docs.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-sm">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 border-b pb-2">
                  <span className="truncate">{d.title}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={d.status} />
                    {d.status === "failed" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2"
                        title={d.extractionError ?? undefined}
                        onClick={() => void retry(d.id)}
                      >
                        Retry
                      </Button>
                    )}
                    <span className="text-muted-foreground">
                      {new Date(d.createdAt).toLocaleDateString()}
                    </span>
                  </span>
                </li>
              ))}
              {!docs.length && <li className="text-muted-foreground">No documents yet.</li>}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Doc["status"] }) {
  const map: Record<Doc["status"], { label: string; cls: string }> = {
    pending: { label: "Queued", cls: "bg-muted text-muted-foreground" },
    processing: { label: "Extracting…", cls: "bg-blue-100 text-blue-700" },
    ready: { label: "Ready", cls: "bg-green-100 text-green-700" },
    failed: { label: "Failed", cls: "bg-red-100 text-red-700" },
  };
  const { label, cls } = map[status];
  return <span className={`rounded px-1.5 py-0.5 text-xs ${cls}`}>{label}</span>;
}
