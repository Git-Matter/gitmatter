import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { api, type ChatAttachment, type Doc, type WorkflowListItem } from "@/lib/api";
import { useMatters } from "@/lib/matters-context";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WorkflowModal } from "./WorkflowModal";
import { WorkflowPickerContent } from "./WorkflowPickerContent";
import { workflowDetailRoute } from "./workflowRoutes";

interface Props {
  workflow: WorkflowListItem | null;
  onClose: () => void;
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200",
        on ? "bg-foreground" : "bg-muted"
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow transition-transform duration-200",
          on ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  );
}

export function DisplayWorkflowModal({ workflow, onClose }: Props) {
  const navigate = useNavigate();
  const { matters } = useMatters();
  // The in-modal picker browses every workflow — fetch the full (non-paged) list
  // here rather than receiving the list page's current slice.
  const { data: workflows = [] } = useQuery({
    queryKey: ["workflows"],
    queryFn: () => api.listWorkflows(),
    enabled: !!workflow,
  });
  const [screen, setScreen] = useState<"select" | "configure">("select");
  const [selected, setSelected] = useState<WorkflowListItem | null>(workflow);
  const [listSearch, setListSearch] = useState("");

  const [inMatter, setInMatter] = useState(false);
  const [matterId, setMatterId] = useState<string>("");
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [docSearch, setDocSearch] = useState("");
  const [assistantMessage, setAssistantMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (workflow) {
      setSelected(workflow);
      setScreen("select");
      setListSearch("");
    } else {
      setSelected(null);
    }
  }, [workflow]);

  useEffect(() => {
    if (screen === "select") {
      setInMatter(false);
      setMatterId("");
      setSelectedDocIds(new Set());
      setDocSearch("");
      setAssistantMessage("");
    }
  }, [screen]);

  const { data: firmDocs = [] } = useQuery({
    queryKey: ["documents"],
    queryFn: () => api.listDocuments(),
    enabled: screen === "configure",
  });
  const { data: matterDocs = [] } = useQuery({
    queryKey: ["matterDocs", matterId],
    queryFn: () => api.listMatterDocuments(matterId),
    enabled: screen === "configure" && inMatter && !!matterId,
  });

  if (!workflow) return null;
  const wf = selected ?? workflow;

  const sourceDocs: Doc[] = inMatter ? matterDocs : firmDocs;
  const q = docSearch.toLowerCase().trim();
  const docs = q ? sourceDocs.filter((d) => d.title.toLowerCase().includes(q)) : sourceDocs;

  function toggleDoc(id: string) {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleClose() {
    setSelected(null);
    setScreen("select");
    onClose();
  }

  function handleStartChat() {
    // A multi-step workflow becomes one chat turn per step (run in order); a
    // single-prompt one is just one step. The optional message is appended to
    // the last step.
    const stepPrompts = wf.steps?.length ? wf.steps.map((s) => s.promptMd) : [wf.promptMd];
    const steps = stepPrompts.map((s) => s.trim()).filter(Boolean);
    const extra = assistantMessage.trim();
    if (extra) {
      if (steps.length) steps[steps.length - 1] = `${steps[steps.length - 1]}\n\n${extra}`;
      else steps.push(extra);
    }
    if (!steps.length) return;
    const attachments: ChatAttachment[] = sourceDocs
      .filter((d) => selectedDocIds.has(d.id))
      .map((d) => ({ kind: "document", id: d.id, label: d.title }));
    sessionStorage.setItem("workflowChatSeed", JSON.stringify({ steps, attachments }));
    handleClose();
    void navigate({ to: "/assistant" });
  }

  async function handleCreateReview() {
    setSaving(true);
    try {
      const { id } = await api.createReview({
        title: wf.title,
        columnsConfig: wf.columnsConfig ?? [],
        documentIds: [...selectedDocIds],
        matterId: inMatter ? matterId : undefined,
      });
      handleClose();
      void navigate({ to: "/reviews/$id", params: { id } });
    } finally {
      setSaving(false);
    }
  }

  const breadcrumbs =
    screen === "select"
      ? ["Workflows", "Select workflow"]
      : [
          <button
            key="back"
            type="button"
            onClick={() => setScreen("select")}
            className="transition-colors hover:text-foreground"
          >
            Workflows
          </button>,
          wf.title,
          wf.type === "assistant" ? "New Chat" : "New Review",
        ];

  const primaryAction =
    screen === "select"
      ? { label: "Use", onClick: () => setScreen("configure") }
      : wf.type === "assistant"
        ? {
            label: "Start Chat",
            onClick: handleStartChat,
            disabled: inMatter && !matterId,
          }
        : {
            label: saving ? "Creating…" : "Create Review",
            onClick: () => void handleCreateReview(),
            disabled: saving || selectedDocIds.size === 0 || (inMatter && !matterId),
          };

  return (
    <WorkflowModal
      open={!!workflow}
      onClose={handleClose}
      size={screen === "select" ? "xl" : "lg"}
      breadcrumbs={breadcrumbs}
      secondaryAction={
        screen === "select"
          ? {
              label: wf.isSystem ? "View Page" : "Edit",
              onClick: () => {
                handleClose();
                void navigate(workflowDetailRoute(wf));
              },
            }
          : undefined
      }
      footerStatus={
        screen === "configure" && selectedDocIds.size > 0 ? (
          <span className="text-xs text-muted-foreground">{selectedDocIds.size} selected</span>
        ) : null
      }
      primaryAction={primaryAction}
      cancelAction={false}
    >
      {screen === "select" ? (
        <WorkflowPickerContent
          workflows={workflows}
          selected={wf}
          onSelect={(next) => next && setSelected(next)}
          search={listSearch}
          onSearchChange={setListSearch}
          workflowType="all"
          previewMode="auto"
          showTypeIcon
          allowClearPreview={false}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden py-1">
          {wf.type === "assistant" && (
            <div className="shrink-0">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Message (optional)</p>
              <textarea
                rows={3}
                value={assistantMessage}
                onChange={(e) => setAssistantMessage(e.target.value)}
                placeholder="Add any additional instructions to the workflow prompt…"
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
              />
            </div>
          )}

          <div className="flex shrink-0 flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">Create under a matter</span>
            <Toggle
              on={inMatter}
              onToggle={() => {
                setInMatter(!inMatter);
                setMatterId("");
                setSelectedDocIds(new Set());
                setDocSearch("");
              }}
            />
          </div>

          {inMatter && (
            <div className="shrink-0">
              <Select
                value={matterId}
                onValueChange={(v) => {
                  setMatterId(v ?? "");
                  setSelectedDocIds(new Set());
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a matter…" />
                </SelectTrigger>
                <SelectContent>
                  {matters.map((m) => (
                    <SelectItem key={m.matter.id} value={m.matter.id}>
                      {m.client.name} — {m.matter.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <p className="shrink-0 text-xs font-medium text-muted-foreground">Select documents</p>
          <div className="shrink-0">
            <div className="flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1">
              <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search…"
                value={docSearch}
                onChange={(e) => setDocSearch(e.target.value)}
                className="flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
              />
              {docSearch && (
                <button
                  onClick={() => setDocSearch("")}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {inMatter && !matterId ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                Select a matter first
              </p>
            ) : docs.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                {q ? "No matches found" : "No documents yet"}
              </p>
            ) : (
              <div className="space-y-0.5">
                {docs.map((d) => (
                  <label
                    key={d.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
                  >
                    <Checkbox checked={selectedDocIds.has(d.id)} onChange={() => toggleDoc(d.id)} />
                    <span className="min-w-0 flex-1 truncate text-foreground">{d.title}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </WorkflowModal>
  );
}
