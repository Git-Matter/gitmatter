import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, type MatterRole } from "@/lib/data/api";

const CONNECT_TABS = ["ChatGPT", "Claude", "Claude Code", "Codex"] as const;
type ConnectTab = (typeof CONNECT_TABS)[number];

export function ConnectAgent() {
  const qc = useQueryClient();
  const { data: tokens = [] } = useQuery({
    queryKey: ["tokens"],
    queryFn: () => api.listTokens(),
  });
  const [label, setLabel] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [tab, setTab] = useState<ConnectTab>("ChatGPT");
  // Scope: null maxRole = full access; empty matter set = all matters.
  const [maxRole, setMaxRole] = useState<MatterRole | null>(null);
  const [matterIds, setMatterIds] = useState<string[]>([]);

  const mcpUrl = typeof window !== "undefined" ? `${window.location.origin}/api/mcp` : "/api/mcp";
  const usesOAuth = tab === "ChatGPT" || tab === "Claude";

  const invalidate = () => qc.invalidateQueries({ queryKey: ["tokens"] });

  const mintMutation = useMutation({
    mutationFn: () =>
      api.mintToken(label.trim() || "default", {
        ...(matterIds.length ? { allowedMatterIds: matterIds } : {}),
        ...(maxRole ? { maxRole } : {}),
      }),
    onSuccess: ({ token }) => {
      setFresh(token);
      setLabel("");
      setMaxRole(null);
      setMatterIds([]);
      void invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.revokeToken(id),
    onSuccess: () => invalidate(),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect an agent</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          gitmatter exposes an MCP server at <code className="text-xs">{mcpUrl}</code>. Connect your
          own AI client - every action it takes is recorded in the same commit history, attributed
          as an agent. It can drive product features but never your account settings.
        </p>

        <AgentClientTabs tab={tab} onChange={setTab} />
        <AgentSetupGuide tab={tab} mcpUrl={mcpUrl} />

        {!usesOAuth || tab === "Claude" ? (
          <TokenMintForm
            label={label}
            fresh={fresh}
            tokens={tokens}
            pending={mintMutation.isPending}
            maxRole={maxRole}
            matterIds={matterIds}
            onLabelChange={setLabel}
            onMaxRoleChange={setMaxRole}
            onMatterIdsChange={setMatterIds}
            onMint={() => mintMutation.mutate()}
            onRevoke={(id) => revokeMutation.mutate(id)}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            ChatGPT connects over OAuth - no token needed here.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AgentClientTabs({
  tab,
  onChange,
}: {
  tab: ConnectTab;
  onChange: (tab: ConnectTab) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CONNECT_TABS.map((item) => (
        <Button
          key={item}
          size="sm"
          variant={tab === item ? "default" : "outline"}
          onClick={() => onChange(item)}
        >
          {item}
        </Button>
      ))}
    </div>
  );
}

function AgentSetupGuide({ tab, mcpUrl }: { tab: ConnectTab; mcpUrl: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
      {tab === "ChatGPT" && (
        <div className="flex flex-col gap-1">
          <p className="font-medium">ChatGPT - Developer Mode (paid plans)</p>
          <p className="text-muted-foreground">
            Settings, Connectors, add a custom connector with the server URL below. ChatGPT runs the
            OAuth login and approval page - no token to paste. Needs the server on public HTTPS.
          </p>
          <CodeBlock>{mcpUrl}</CodeBlock>
        </div>
      )}
      {tab === "Claude" && (
        <div className="flex flex-col gap-1">
          <p className="font-medium">Claude Desktop / web - custom connector</p>
          <p className="text-muted-foreground">
            Add a connector with the URL below for the OAuth login + approval. Prefer a static token
            instead? Mint one below and use the <code className="text-xs">mcp-remote</code> bridge
            with an <code className="text-xs">Authorization: Bearer</code> header.
          </p>
          <CodeBlock>{mcpUrl}</CodeBlock>
        </div>
      )}
      {tab === "Claude Code" && (
        <div className="flex flex-col gap-1">
          <p className="font-medium">Claude Code CLI - static token</p>
          <p className="text-muted-foreground">Mint a token below, then run:</p>
          <CodeBlock>{`claude mcp add --transport http gitmatter ${mcpUrl} \\\n  --header "Authorization: Bearer <token>"`}</CodeBlock>
        </div>
      )}
      {tab === "Codex" && (
        <div className="flex flex-col gap-1">
          <p className="font-medium">Codex CLI - static token</p>
          <p className="text-muted-foreground">
            Mint a token below, set <code className="text-xs">GITMATTER_TOKEN</code>, then add to{" "}
            <code className="text-xs">~/.codex/config.toml</code>:
          </p>
          <CodeBlock>{`[mcp_servers.gitmatter]\nurl = "${mcpUrl}"\nbearer_token_env_var = "GITMATTER_TOKEN"`}</CodeBlock>
        </div>
      )}
    </div>
  );
}

function TokenMintForm({
  label,
  fresh,
  tokens,
  pending,
  maxRole,
  matterIds,
  onLabelChange,
  onMaxRoleChange,
  onMatterIdsChange,
  onMint,
  onRevoke,
}: {
  label: string;
  fresh: string | null;
  tokens: Array<{
    id: string;
    label: string;
    allowedMatterIds: string[] | null;
    maxRole: MatterRole | null;
    lastUsedAt: string | null;
    revokedAt: string | null;
  }>;
  pending: boolean;
  maxRole: MatterRole | null;
  matterIds: string[];
  onLabelChange: (label: string) => void;
  onMaxRoleChange: (role: MatterRole | null) => void;
  onMatterIdsChange: (ids: string[]) => void;
  onMint: () => void;
  onRevoke: (id: string) => void;
}) {
  const activeTokens = tokens.filter((token) => !token.revokedAt);
  const { data: matters = [] } = useQuery({
    queryKey: ["matters"],
    queryFn: () => api.listMatters(),
  });
  const matterTitle = (id: string) =>
    matters.find((m) => m.matter.id === id)?.matter.name ?? "unknown matter";

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-stack">
      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="label">New token label</Label>
          <Input
            id="label"
            placeholder="claude-desktop"
            value={label}
            onChange={(e) => onLabelChange(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Access</Label>
          <Select
            value={maxRole ?? "full"}
            onValueChange={(v) => onMaxRoleChange(v === "full" ? null : (v as MatterRole))}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="full">Full access</SelectItem>
              <SelectItem value="editor">Editor</SelectItem>
              <SelectItem value="viewer">Read-only</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={onMint} disabled={pending}>
          {pending ? "Minting..." : "Mint token"}
        </Button>
      </div>

      {matters.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label>Limit to matters (none selected = all your matters)</Label>
          <div className="flex max-h-36 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2">
            {matters.map(({ matter }) => (
              <label key={matter.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={matterIds.includes(matter.id)}
                  onChange={(e) =>
                    onMatterIdsChange(
                      e.target.checked
                        ? [...matterIds, matter.id]
                        : matterIds.filter((id) => id !== matter.id)
                    )
                  }
                />
                {matter.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {fresh && (
        <div className="rounded-md border border-bronze/40 bg-bronze-tint p-3 text-sm">
          <p className="font-medium">Copy this token now - it won't be shown again:</p>
          <CodeBlock>{fresh}</CodeBlock>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label>Active tokens</Label>
        <ul className="flex flex-col gap-1.5 text-sm">
          {activeTokens.map((token) => (
            <li key={token.id} className="flex items-center justify-between border-b pb-1.5">
              <span>
                {token.label}{" "}
                <span className="text-muted-foreground">
                  ·{" "}
                  {token.lastUsedAt
                    ? `used ${new Date(token.lastUsedAt).toLocaleDateString()}`
                    : "never used"}
                  {token.maxRole
                    ? ` · ${token.maxRole === "viewer" ? "read-only" : token.maxRole}`
                    : ""}
                  {token.allowedMatterIds?.length
                    ? ` · ${token.allowedMatterIds.length === 1 ? matterTitle(token.allowedMatterIds[0]!) : `${token.allowedMatterIds.length} matters`}`
                    : ""}
                </span>
              </span>
              <Button size="xs" variant="ghost" onClick={() => onRevoke(token.id)}>
                Revoke
              </Button>
            </li>
          ))}
          {!activeTokens.length && <li className="text-muted-foreground">No active tokens.</li>}
        </ul>
      </div>
    </div>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <code className="mt-1 block rounded bg-muted p-2 text-xs break-all whitespace-pre-wrap">
      {children}
    </code>
  );
}
