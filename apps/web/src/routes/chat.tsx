import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "../lib/api";

export const Route = createFileRoute("/chat")({ component: Chat });

type Turn = {
  role: "user" | "assistant";
  text: string;
  toolCalls?: Array<{ tool: string; input: unknown }>;
};

function Chat() {
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [tools, setTools] = useState<string[]>([]);
  const [jurisdiction, setJurisdiction] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const message = input.trim();
    if (!message) return;
    setTurns((t) => [...t, { role: "user", text: message }]);
    setInput("");
    setBusy(true);
    try {
      const r = await api.sendChat(message);
      setTools(r.tools);
      setJurisdiction(r.jurisdiction);
      setTurns((t) => [...t, { role: "assistant", text: r.text, toolCalls: r.toolCalls }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-2 flex items-center gap-2">
        <h1 className="text-xl font-semibold">Chat</h1>
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
        <Button onClick={send} disabled={busy} className="self-end">
          {busy ? "Thinking…" : "Send (⌘↵)"}
        </Button>
      </div>
    </div>
  );
}
