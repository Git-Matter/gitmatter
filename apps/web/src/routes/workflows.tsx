import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, type WorkflowDetail } from "../lib/api";
import { useWorkingMatterId } from "../lib/matters-context";

export const Route = createFileRoute("/workflows")({ component: Workflows });

type Item = { id: string; title: string; type: string; isSystem: boolean };

function Workflows() {
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<WorkflowDetail | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = () =>
    api
      .listWorkflows()
      .then(setItems)
      .catch(() => {});
  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="grid gap-stack lg:grid-cols-[1fr_1.4fr]">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-2xl tracking-tight">Workflows</h1>
          <Button
            size="sm"
            onClick={() => {
              setCreating(true);
              setSelected(null);
            }}
          >
            New
          </Button>
        </div>
        <ul className="flex flex-col gap-2">
          {items.map((w) => (
            <li key={w.id}>
              <button
                className="w-full rounded-md border p-2 text-left text-sm hover:bg-muted/50"
                onClick={() => {
                  setCreating(false);
                  api
                    .getWorkflow(w.id)
                    .then(setSelected)
                    .catch(() => {});
                }}
              >
                <span className="flex items-center gap-2">
                  {w.title}
                  <Badge variant="outline">{w.type}</Badge>
                  {w.isSystem && <Badge variant="secondary">system</Badge>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        {creating && (
          <CreateWorkflow
            onCreated={() => {
              setCreating(false);
              void refresh();
            }}
          />
        )}
        {!creating && selected && (
          <EditWorkflow
            detail={selected}
            onSaved={(d) => {
              setSelected(d);
              void refresh();
            }}
          />
        )}
        {!creating && !selected && (
          <p className="pt-2 text-muted-foreground">Select a workflow or create one.</p>
        )}
      </div>
    </div>
  );
}

function CreateWorkflow({ onCreated }: { onCreated: () => void }) {
  const matterId = useWorkingMatterId();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"assistant" | "tabular">("assistant");
  const [promptMd, setPromptMd] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!title.trim() || !promptMd.trim()) return;
    setBusy(true);
    try {
      await api.createWorkflow({ title: title.trim(), type, promptMd, matterId });
      toast.success("Workflow created");
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New workflow</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="flex gap-2">
          {(["assistant", "tabular"] as const).map((t) => (
            <Button
              key={t}
              size="sm"
              variant={type === t ? "default" : "outline"}
              onClick={() => setType(t)}
            >
              {t}
            </Button>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Prompt</Label>
          <Textarea rows={6} value={promptMd} onChange={(e) => setPromptMd(e.target.value)} />
        </div>
        <Button onClick={create} disabled={busy} className="self-start">
          {busy ? "Creating…" : "Create"}
        </Button>
      </CardContent>
    </Card>
  );
}

function EditWorkflow({
  detail,
  onSaved,
}: {
  detail: WorkflowDetail;
  onSaved: (d: WorkflowDetail) => void;
}) {
  const { workflow, blame } = detail;
  const [title, setTitle] = useState(workflow.title);
  const [promptMd, setPromptMd] = useState(workflow.promptMd);
  const [busy, setBusy] = useState(false);
  const readOnly = workflow.isSystem;
  const promptBlame = blame["field/prompt_md"];

  useEffect(() => {
    setTitle(workflow.title);
    setPromptMd(workflow.promptMd);
  }, [workflow.id, workflow.title, workflow.promptMd]);

  async function save() {
    setBusy(true);
    try {
      const updated = await api.updateWorkflow(workflow.id, { title, promptMd });
      onSaved(updated);
      toast.success("Saved — new commit recorded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {workflow.title}
          {readOnly && <Badge variant="secondary">system (read-only)</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={readOnly} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="flex items-center gap-2">
            Prompt
            {promptBlame && (
              <span className="text-xs font-normal text-muted-foreground">
                last edited by{" "}
                {promptBlame.actorType === "agent" ? (promptBlame.agentLabel ?? "agent") : "you"} ·
                #{promptBlame.seq}
              </span>
            )}
          </Label>
          <Textarea
            rows={8}
            value={promptMd}
            onChange={(e) => setPromptMd(e.target.value)}
            disabled={readOnly}
          />
        </div>
        {!readOnly && (
          <Button onClick={save} disabled={busy} className="self-start">
            {busy ? "Saving…" : "Save"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
