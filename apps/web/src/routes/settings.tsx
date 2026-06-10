import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JURISDICTIONS, toolsFor } from "@workspace/registry";
import { api } from "../lib/api";

export const Route = createFileRoute("/settings")({ component: Settings });

function Settings() {
  return (
    <div className="flex max-w-2xl flex-col gap-section">
      <JurisdictionCard />
      <AnthropicKey />
      <McpTokens />
    </div>
  );
}

function JurisdictionCard() {
  const [jurisdiction, setJurisdiction] = useState<string>("");
  const [saved, setSaved] = useState<string>("");

  useEffect(() => {
    api
      .getSettings()
      .then((r) => {
        setJurisdiction(r.jurisdiction ?? "");
        setSaved(r.jurisdiction ?? "");
      })
      .catch(() => {});
  }, []);

  async function save(next: string) {
    setJurisdiction(next);
    try {
      await api.setSettings(next || null);
      setSaved(next);
      toast.success("Jurisdiction updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  const effective = saved || "US";
  const tools = toolsFor(effective);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Default jurisdiction</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Dictates which legal tools are available. Individual contracts can override this.
        </p>
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
          value={jurisdiction}
          onChange={(e) => save(e.target.value)}
        >
          <option value="">System default (US)</option>
          {JURISDICTIONS.map((j) => (
            <option key={j.code} value={j.code}>
              {j.label}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">Tools for {effective}:</span>
          {tools.map((t) => (
            <Badge key={t.name} variant="outline" className="font-mono text-xs">
              {t.name}
            </Badge>
          ))}
          {!tools.length && <span className="text-muted-foreground">none</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function AnthropicKey() {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getKeys()
      .then((r) => setHasKey(r.hasAnthropic))
      .catch(() => setHasKey(false));
  }, []);

  async function save() {
    if (!key.trim()) return;
    setBusy(true);
    try {
      await api.setKey(key.trim());
      setHasKey(true);
      setKey("");
      toast.success("Anthropic key saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Anthropic API key
          {hasKey ? (
            <Badge variant="secondary">configured</Badge>
          ) : (
            <Badge variant="outline">not set</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Bring your own key. Encrypted at rest, used to run cell extraction (incl. via MCP).
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="key">Key</Label>
          <Input
            id="key"
            type="password"
            placeholder="sk-ant-…"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        </div>
        <Button onClick={save} disabled={busy || !key.trim()} className="self-start">
          {busy ? "Saving…" : "Save key"}
        </Button>
      </CardContent>
    </Card>
  );
}

type Token = {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

function McpTokens() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [label, setLabel] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mcpUrl = typeof window !== "undefined" ? `${window.location.origin}/api/mcp` : "/api/mcp";
  const refresh = () =>
    api
      .listTokens()
      .then(setTokens)
      .catch(() => {});
  useEffect(() => {
    void refresh();
  }, []);

  async function mint() {
    setBusy(true);
    try {
      const { token } = await api.mintToken(label.trim() || "default");
      setFresh(token);
      setLabel("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    await api.revokeToken(id);
    await refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect Claude (MCP)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          gitcounsel exposes an MCP server. Mint a token and connect Claude Desktop, the Claude CLI,
          or Cowork — every action Claude takes is recorded in the same commit history, attributed
          as an agent.
        </p>

        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="label">New token label</Label>
            <Input
              id="label"
              placeholder="claude-desktop"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <Button onClick={mint} disabled={busy}>
            {busy ? "Minting…" : "Mint token"}
          </Button>
        </div>

        {fresh && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <p className="font-medium">Copy this token now — it won't be shown again:</p>
            <code className="mt-1 block rounded bg-background p-2 text-xs break-all">{fresh}</code>
            <p className="mt-2 font-medium">Claude CLI:</p>
            <code className="mt-1 block rounded bg-background p-2 text-xs break-all">
              claude mcp add --transport http gitcounsel {mcpUrl} --header "Authorization: Bearer{" "}
              {fresh}"
            </code>
            <p className="mt-2 font-medium">Claude Desktop / Cowork (custom connector):</p>
            <code className="mt-1 block rounded bg-background p-2 text-xs break-all">
              {JSON.stringify(
                { url: mcpUrl, headers: { Authorization: `Bearer ${fresh}` } },
                null,
                2
              )}
            </code>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label>Active tokens</Label>
          <ul className="flex flex-col gap-1.5 text-sm">
            {tokens
              .filter((t) => !t.revokedAt)
              .map((t) => (
                <li key={t.id} className="flex items-center justify-between border-b pb-1.5">
                  <span>
                    {t.label}{" "}
                    <span className="text-muted-foreground">
                      ·{" "}
                      {t.lastUsedAt
                        ? `used ${new Date(t.lastUsedAt).toLocaleDateString()}`
                        : "never used"}
                    </span>
                  </span>
                  <Button size="xs" variant="ghost" onClick={() => revoke(t.id)}>
                    Revoke
                  </Button>
                </li>
              ))}
            {!tokens.filter((t) => !t.revokedAt).length && (
              <li className="text-muted-foreground">No active tokens.</li>
            )}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
