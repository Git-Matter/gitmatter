import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FileDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ModelPicker } from "@/components/ModelPicker";
import { api, type Citation } from "../lib/api";

export const Route = createFileRoute("/chat")({ component: Chat });

type Turn = {
  role: "user" | "assistant";
  text: string;
  toolCalls?: Array<{ tool: string; input: unknown }>;
  documents?: Array<{ id: string; title: string; download: string }>;
  citations?: Citation[];
};

function citationHref(cit: Citation): string {
  if (cit.cluster_id) return `https://www.courtlistener.com/opinion/${cit.cluster_id}/`;
  return "/documents";
}

function citationLabel(cit: Citation): string {
  if (cit.cluster_id) return `Case law (opinion ${cit.opinion_id ?? cit.cluster_id})`;
  if (cit.quotes?.length) return cit.quotes[0]!;
  return "Document";
}

function Chat() {
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [tools, setTools] = useState<string[]>([]);
  const [jurisdiction, setJurisdiction] = useState<string>("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const message = input.trim();
    if (!message) return;
    setTurns((t) => [...t, { role: "user", text: message }]);
    setInput("");
    setBusy(true);
    try {
      const r = await api.sendChat(message, model || undefined);
      setTools(r.tools);
      setJurisdiction(r.jurisdiction);
      setTurns((t) => [
        ...t,
        {
          role: "assistant",
          text: r.text,
          toolCalls: r.toolCalls,
          documents: r.documents,
          citations: r.citations,
        },
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-2 flex items-center gap-2">
        <h1 className="text-2xl tracking-tight">Chat</h1>
        {jurisdiction && <Badge variant="outline">{jurisdiction}</Badge>}
        {tools.length > 0 && <Badge variant="secondary">{tools.length} MCP tools</Badge>}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Claude (your key) with connected MCP tools (CourtListener, MarkItDown). Try: "Search case
        law for Chevron deference."
      </p>

      <div className="flex flex-col gap-stack">
        {turns.map((t, i) => (
          <Card key={i} className={t.role === "user" ? "bg-muted/40" : ""}>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs text-muted-foreground uppercase">{t.role}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <p className="text-sm whitespace-pre-wrap">{t.text}</p>
              {t.toolCalls && t.toolCalls.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {t.toolCalls.map((tc, j) => (
                    <Badge key={j} variant="outline" className="font-mono text-xs">
                      {tc.tool}
                    </Badge>
                  ))}
                </div>
              )}
              {t.citations && t.citations.length > 0 && (
                <div className="flex flex-col gap-1 border-t border-border pt-2">
                  <span className="text-xs font-medium text-muted-foreground">Sources</span>
                  {t.citations.map((cit) => (
                    <a
                      key={cit.ref}
                      href={citationHref(cit)}
                      target={cit.cluster_id ? "_blank" : undefined}
                      rel={cit.cluster_id ? "noreferrer" : undefined}
                      className="flex gap-2 text-xs hover:text-foreground"
                    >
                      <span className="font-mono text-muted-foreground">[{cit.ref}]</span>
                      <span className="truncate text-muted-foreground">{citationLabel(cit)}</span>
                    </a>
                  ))}
                </div>
              )}
              {t.documents?.map((d) => (
                <a
                  key={d.id}
                  href={api.documentDownloadUrl(d.id)}
                  className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted/50"
                >
                  <FileDown className="size-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{d.title}</span>
                  <span className="text-xs text-muted-foreground">Download .docx</span>
                </a>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <Textarea
          rows={3}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <ModelPicker value={model} onChange={setModel} />
          <Button onClick={send} disabled={busy}>
            {busy ? "Thinking…" : "Send (⌘↵)"}
          </Button>
        </div>
      </div>
    </div>
  );
}
