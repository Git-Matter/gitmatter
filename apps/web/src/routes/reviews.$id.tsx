import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ModelPicker } from "@/components/ModelPicker";
import { api, type Blame, type Cell, type Doc, type ReviewDetail } from "../lib/api";

export const Route = createFileRoute("/reviews/$id")({ component: ReviewView });

const FLAG_COLOR: Record<string, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
  grey: "bg-gray-400",
};

function ReviewView() {
  const { id } = Route.useParams();
  const [data, setData] = useState<ReviewDetail | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [history, setHistory] = useState<Blame[]>([]);
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [model, setModel] = useState("");

  const loadHistory = useCallback(
    () =>
      api
        .history(id)
        .then(setHistory)
        .catch(() => {}),
    [id]
  );

  useEffect(() => {
    api
      .getReview(id)
      .then(setData)
      .catch(() => {});
    api
      .listDocuments()
      .then(setDocs)
      .catch(() => {});
    void loadHistory();
  }, [id, loadHistory]);

  if (!data) return <p className="pt-6 text-muted-foreground">Loading…</p>;

  const { review, cells } = data;
  const docTitle = (docId: string) => docs.find((d) => d.id === docId)?.title ?? docId.slice(0, 8);
  const cellOf = (docId: string, col: number): Cell | undefined =>
    cells.find((c) => c.documentId === docId && c.columnIndex === col);

  async function run(documentId: string, columnIndex: number) {
    const key = `${documentId}:${columnIndex}`;
    setRunning((s) => new Set(s).add(key));
    try {
      const updated = await api.runCell(id, documentId, columnIndex, model || undefined);
      setData(updated);
      await loadHistory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Run failed");
    } finally {
      setRunning((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
    }
  }

  async function runAll() {
    for (const docId of review.documentIds) {
      for (const col of review.columnsConfig) {
        await run(docId, col.index);
      }
    }
  }

  return (
    <div className="grid gap-6 pt-6 lg:grid-cols-[1fr_280px]">
      <div className="min-w-0">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h1 className="text-2xl tracking-tight">{review.title}</h1>
          <div className="flex items-center gap-2">
            <ModelPicker value={model} onChange={setModel} />
            <a href={api.reviewExportUrl(id, "csv")}>
              <Button size="sm" variant="outline">
                CSV
              </Button>
            </a>
            <a href={api.reviewExportUrl(id, "xlsx")}>
              <Button size="sm" variant="outline">
                XLSX
              </Button>
            </a>
            <Button size="sm" onClick={runAll}>
              Run all cells
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Document</TableHead>
                {review.columnsConfig.map((col) => (
                  <TableHead key={col.index}>{col.name}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {review.documentIds.map((docId) => (
                <TableRow key={docId}>
                  <TableCell className="align-top font-medium">{docTitle(docId)}</TableCell>
                  {review.columnsConfig.map((col) => {
                    const cell = cellOf(docId, col.index);
                    const key = `${docId}:${col.index}`;
                    const busy = running.has(key);
                    return (
                      <TableCell key={col.index} className="align-top">
                        {cell?.content ? (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-start gap-2">
                              <span
                                className={`mt-1.5 size-2 shrink-0 rounded-full ${FLAG_COLOR[cell.content.flag] ?? "bg-gray-400"}`}
                              />
                              <span className="text-sm">{cell.content.summary}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {cell.blame && <BlamePopover blame={cell.blame} />}
                              <Button
                                size="xs"
                                variant="ghost"
                                disabled={busy}
                                onClick={() => run(docId, col.index)}
                              >
                                {busy ? "…" : "Re-run"}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={busy}
                            onClick={() => run(docId, col.index)}
                          >
                            {busy ? "Running…" : "Run"}
                          </Button>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <aside>
        <h2 className="mb-2 text-sm font-semibold">History</h2>
        <ol className="flex flex-col gap-2">
          {history.map((c) => (
            <li key={c.id} className="rounded-md border p-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-mono text-muted-foreground">#{c.seq}</span>
                <Badge variant={c.actorType === "agent" ? "default" : "secondary"}>
                  {c.actorType === "agent" ? (c.agentLabel ?? "agent") : "you"}
                </Badge>
                <span className="font-mono">{c.op}</span>
              </div>
              <p className="mt-1">{c.message}</p>
              <p className="mt-0.5 text-muted-foreground">
                {new Date(c.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
          {!history.length && <li className="text-xs text-muted-foreground">No commits yet.</li>}
        </ol>
      </aside>
    </div>
  );
}

function BlamePopover({ blame }: { blame: Blame }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button className="text-xs text-muted-foreground underline-offset-2 hover:underline">
            blame #{blame.seq}
          </button>
        }
      />
      <PopoverContent className="w-64 text-xs">
        <div className="flex items-center gap-2">
          <Badge variant={blame.actorType === "agent" ? "default" : "secondary"}>
            {blame.actorType === "agent" ? (blame.agentLabel ?? "agent") : "you"}
          </Badge>
          <span className="font-mono">{blame.op}</span>
        </div>
        <p className="mt-1">{blame.message}</p>
        <p className="mt-0.5 text-muted-foreground">{new Date(blame.createdAt).toLocaleString()}</p>
      </PopoverContent>
    </Popover>
  );
}
