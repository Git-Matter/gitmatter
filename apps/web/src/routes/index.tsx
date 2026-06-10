import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { api, type Column, type Doc } from "../lib/api";
import { useSession } from "../lib/auth-client";
import { useWorkingMatterId } from "../lib/matters-context";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { data: session, isPending } = useSession();
  if (isPending) return null;
  if (!session)
    return (
      <div className="text-center">
        <h1 className="text-2xl font-semibold">gitcounsel</h1>
        <p className="mt-2 text-muted-foreground">
          Version-controlled legal review. Every change — yours or Claude's — is a commit.
        </p>
        <div className="mt-4 flex justify-center gap-3">
          <Link to="/signup">
            <Button>Get started</Button>
          </Link>
          <Link to="/login">
            <Button variant="outline">Log in</Button>
          </Link>
        </div>
      </div>
    );
  return <Reviews />;
}

function Reviews() {
  const router = useRouter();
  const [reviews, setReviews] = useState<Array<{ id: string; title: string; createdAt: string }>>(
    []
  );
  const [docs, setDocs] = useState<Doc[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api
      .listReviews()
      .then(setReviews)
      .catch(() => {});
    api
      .listDocuments()
      .then(setDocs)
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col gap-section">
      <PageHeader
        title="Tabular reviews"
        description="Extract a grid of answers across documents. Every cell is a commit."
        action={
          <Button onClick={() => setCreating((v) => !v)}>
            {creating ? "Cancel" : "New review"}
          </Button>
        }
      />

      {creating && (
        <CreateReview
          docs={docs}
          onCreated={(id) => router.navigate({ to: "/reviews/$id", params: { id } })}
        />
      )}

      <div className="grid gap-stack sm:grid-cols-2 lg:grid-cols-3">
        {reviews.map((r) => (
          <Link key={r.id} to="/reviews/$id" params={{ id: r.id }}>
            <Card className="transition-colors hover:bg-muted/50">
              <CardHeader>
                <CardTitle className="text-base">{r.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {new Date(r.createdAt).toLocaleString()}
              </CardContent>
            </Card>
          </Link>
        ))}
        {!reviews.length && <p className="text-muted-foreground">No reviews yet.</p>}
      </div>
    </div>
  );
}

function CreateReview({ docs, onCreated }: { docs: Doc[]; onCreated: (id: string) => void }) {
  const matterId = useWorkingMatterId();
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [columns, setColumns] = useState<Column[]>([{ index: 0, name: "", prompt: "" }]);
  const [busy, setBusy] = useState(false);

  function setCol(i: number, patch: Partial<Column>) {
    setColumns((cols) => cols.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  async function create() {
    const cols = columns
      .filter((c) => c.name.trim() && c.prompt.trim())
      .map((c, i) => ({ ...c, index: i }));
    if (!title.trim() || !selected.length || !cols.length) {
      return toast.error("Need a title, at least one document, and one column");
    }
    setBusy(true);
    try {
      const { id } = await api.createReview({
        title: title.trim(),
        columnsConfig: cols,
        documentIds: selected,
        matterId,
      });
      onCreated(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New review</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-stack">
        <div className="flex flex-col gap-field">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Q3 NDAs" />
        </div>

        <div className="flex flex-col gap-field">
          <Label>Documents</Label>
          {!docs.length && (
            <p className="text-sm text-muted-foreground">
              No documents.{" "}
              <Link to="/documents" className="underline">
                Add one first
              </Link>
              .
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {docs.map((d) => {
              const on = selected.includes(d.id);
              return (
                <Button
                  key={d.id}
                  type="button"
                  size="sm"
                  variant={on ? "default" : "outline"}
                  onClick={() =>
                    setSelected((s) => (on ? s.filter((x) => x !== d.id) : [...s, d.id]))
                  }
                >
                  {d.title}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Columns</Label>
          {columns.map((c, i) => (
            <div key={i} className="flex gap-2">
              <Input
                className="w-40"
                placeholder="Name"
                value={c.name}
                onChange={(e) => setCol(i, { name: e.target.value })}
              />
              <Input
                className="flex-1"
                placeholder="Extraction prompt"
                value={c.prompt}
                onChange={(e) => setCol(i, { prompt: e.target.value })}
              />
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() =>
              setColumns((cols) => [...cols, { index: cols.length, name: "", prompt: "" }])
            }
          >
            + Add column
          </Button>
        </div>

        <Button onClick={create} disabled={busy} className="self-start">
          {busy ? "Creating…" : "Create review"}
        </Button>
      </CardContent>
    </Card>
  );
}
