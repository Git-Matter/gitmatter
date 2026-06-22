import { ArrowRight, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ModelPicker } from "@/components/ModelPicker";
import { ReasoningPicker } from "./ReasoningPicker";
import { AttachChips, AttachControls } from "./ChatAttachments";
import { type ChatAttachment, type ReasoningEffort } from "../../../../lib/data/api";

/** The message composer — textarea, model/reasoning/attachment controls, send. */
export function Composer({
  input,
  setInput,
  model,
  setModel,
  reasoning,
  setReasoning,
  attachments,
  onAdd,
  onRemove,
  onUpload,
  hasProcessing,
  busy,
  onSend,
  onStop,
  matterId,
}: {
  input: string;
  setInput: (v: string) => void;
  model: string;
  setModel: (v: string) => void;
  reasoning: ReasoningEffort | null;
  setReasoning: (v: ReasoningEffort | null) => void;
  attachments: ChatAttachment[];
  onAdd: (a: ChatAttachment) => void;
  onRemove: (a: ChatAttachment) => void;
  onUpload: (file: File) => void;
  hasProcessing: boolean;
  busy: boolean;
  onSend: () => void;
  onStop?: () => void;
  matterId?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-xs focus-within:border-ring/60">
      <AttachChips attachments={attachments} onRemove={onRemove} />
      <Textarea
        rows={2}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Ask a question about your documents…"
        className="resize-none border-0 bg-transparent px-4 pt-3 shadow-none focus-visible:ring-0"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
      />
      <div className="@container/composer flex items-center justify-between gap-2 px-3 pb-3">
        <div className="flex min-w-0 [scrollbar-width:none] items-center gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden">
          <ModelPicker value={model} onChange={setModel} />
          <ReasoningPicker model={model} value={reasoning} onChange={setReasoning} />
          <span className="mx-1 h-4 w-px shrink-0 bg-border" />
          <AttachControls
            attachments={attachments}
            onAdd={onAdd}
            onUpload={onUpload}
            matterId={matterId}
          />
        </div>
        {busy && onStop ? (
          <Button
            size="icon"
            onClick={onStop}
            title="Stop"
            aria-label="Stop"
            className="shrink-0 rounded-full"
          >
            <Square className="size-3.5 fill-current" />
          </Button>
        ) : (
          <Button
            size="icon"
            onClick={onSend}
            disabled={busy || !input.trim() || hasProcessing}
            title={hasProcessing ? "Waiting for documents to finish processing" : "Send"}
            aria-label="Send"
            className="shrink-0 rounded-full"
          >
            <ArrowRight className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
