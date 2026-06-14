import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useTheme } from "next-themes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { JURISDICTIONS, toolsFor } from "@workspace/registry";
import { api, type LlmProvider, type ProviderKeyStatus } from "../../lib/api";
import { changeEmail, changePassword, deleteUser, updateUser } from "../../lib/auth-client";

export const Route = createFileRoute("/_auth/settings")({ component: Settings });

function Settings() {
  return (
    <PageShell header={<PageHeader title="Settings" />}>
      <Tabs defaultValue="account" className="flex max-w-2xl flex-col gap-section">
        <TabsList>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="organization">Organization</TabsTrigger>
          <TabsTrigger value="ai">AI &amp; Models</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
        </TabsList>
        <TabsContent value="account" className="flex flex-col gap-section">
          <ProfileCard />
          <EmailCard />
          <PasswordCard />
          <AppearanceCard />
          <DangerZoneCard />
        </TabsContent>
        <TabsContent value="organization">
          <OrganizationCard />
        </TabsContent>
        <TabsContent value="ai" className="flex flex-col gap-section">
          <JurisdictionCard />
          <ProviderKeys />
        </TabsContent>
        <TabsContent value="agents">
          <ConnectAgent />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

// Profile: display name + avatar URL. better-auth stores `image` as a URL string;
// there's no upload pipeline, so the avatar is a plain URL field. After saving we
// invalidate the router so the root beforeLoad re-resolves the session and the
// sidebar reflects the change without a full reload.
function ProfileCard() {
  const router = useRouter();
  const { session } = Route.useRouteContext();
  const [name, setName] = useState(session.user.name ?? "");
  const [image, setImage] = useState(session.user.image ?? "");

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await updateUser({ name: name.trim(), image: image.trim() || undefined });
      if (error) throw new Error(error.message ?? "Failed to update profile");
    },
    onSuccess: async () => {
      await router.invalidate();
      toast.success("Profile updated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-field">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-name">Display name</Label>
          <Input
            id="profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Doe"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-image">Avatar URL</Label>
          <Input
            id="profile-image"
            type="url"
            value={image}
            onChange={(e) => setImage(e.target.value)}
            placeholder="https://…"
          />
        </div>
        <Button
          className="self-start"
          onClick={() => save.mutate()}
          disabled={save.isPending || !name.trim()}
        >
          {save.isPending ? "Saving…" : "Save profile"}
        </Button>
      </CardContent>
    </Card>
  );
}

// Email change. No verification email is configured and the current email is never
// verified, so better-auth applies the new email immediately.
function EmailCard() {
  const router = useRouter();
  const { session } = Route.useRouteContext();
  const [email, setEmail] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await changeEmail({ newEmail: email.trim() });
      if (error) throw new Error(error.message ?? "Failed to change email");
    },
    onSuccess: async () => {
      setEmail("");
      await router.invalidate();
      toast.success("Email updated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-field">
        <p className="text-sm text-muted-foreground">
          Current: <span className="font-medium text-foreground">{session.user.email}</span>
        </p>
        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="new-email">New email</Label>
            <Input
              id="new-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@firm.com"
            />
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !email.trim()}>
            {save.isPending ? "Saving…" : "Update"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: true,
      });
      if (error) throw new Error(error.message ?? "Failed to change password");
    },
    onSuccess: () => {
      setCurrent("");
      setNext("");
      toast.success("Password changed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-field">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="current-password">Current password</Label>
          <Input
            id="current-password"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </div>
        <Button
          className="self-start"
          onClick={() => save.mutate()}
          disabled={save.isPending || !current || !next}
        >
          {save.isPending ? "Saving…" : "Change password"}
        </Button>
      </CardContent>
    </Card>
  );
}

const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

function AppearanceCard() {
  const { theme, setTheme } = useTheme();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-field">
        <p className="text-sm text-muted-foreground">Theme used across gitcounsel.</p>
        <div className="flex flex-wrap gap-1.5">
          {THEMES.map((t) => (
            <Button
              key={t.value}
              size="sm"
              variant={theme === t.value ? "default" : "outline"}
              onClick={() => setTheme(t.value)}
            >
              {t.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Account deletion. No verification callback is configured, so deleteUser removes
// the account immediately; we require the password and confirm via a dialog.
function DangerZoneCard() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await deleteUser({ password });
      if (error) throw new Error(error.message ?? "Failed to delete account");
    },
    onSuccess: () => {
      window.location.href = "/signup";
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">Delete account</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-field">
        <p className="text-sm text-muted-foreground">
          Permanently delete your account. This cannot be undone.
        </p>
        <Button variant="outline" className="self-start" onClick={() => setOpen(true)}>
          Delete account
        </Button>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This permanently removes your account and cannot be undone. Enter your password to
              confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-field">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="delete-password">Password</Label>
              <Input
                id="delete-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => remove.mutate()}
                disabled={remove.isPending || !password}
              >
                {remove.isPending ? "Deleting…" : "Delete account"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// Tenant directory + invites. Sharing is restricted to people in your
// organization; admins invite teammates by email (create-or-invite at signup).
function OrganizationCard() {
  const qc = useQueryClient();
  const { data: tenant } = useQuery({ queryKey: ["tenant"], queryFn: () => api.getTenant() });
  const { data: invites = [], isError } = useQuery({
    queryKey: ["invites"],
    queryFn: () => api.listInvites(),
    retry: false,
  });
  const [email, setEmail] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["invites"] });

  const create = useMutation({
    mutationFn: () => api.createInvite(email.trim()),
    onSuccess: (inv) => {
      setEmail("");
      setFresh(inv.token);
      void invalidate();
      toast.success("Invite created");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.revokeInvite(id),
    onSuccess: () => invalidate(),
  });

  // Non-admins get 403 on the invites list — hide the management UI for them.
  const isAdmin = !isError;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-stack">
        <p className="text-sm text-muted-foreground">
          {tenant ? tenant.name : "Your organization"}. Matters, reviews, and workflows can only be
          shared with people in this organization.
        </p>

        {isAdmin ? (
          <>
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (email.trim()) create.mutate();
              }}
            >
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="invite-email">Invite a teammate</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="colleague@firm.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={create.isPending || !email.trim()}>
                {create.isPending ? "Inviting…" : "Invite"}
              </Button>
            </form>

            {fresh && (
              <div className="rounded-md border border-bronze/40 bg-bronze-tint p-3 text-sm">
                <p className="font-medium">
                  Share this signup link — they join your organization on sign-up:
                </p>
                <Code>
                  {typeof window !== "undefined" ? window.location.origin : ""}/signup?invite=
                  {fresh}
                </Code>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label>Pending invites</Label>
              <ul className="flex flex-col gap-1.5 text-sm">
                {invites
                  .filter((i) => !i.acceptedAt)
                  .map((i) => (
                    <li key={i.id} className="flex items-center justify-between border-b pb-1.5">
                      <span>
                        {i.email}{" "}
                        <span className="text-muted-foreground capitalize">· {i.role}</span>
                      </span>
                      <Button size="xs" variant="ghost" onClick={() => revoke.mutate(i.id)}>
                        Revoke
                      </Button>
                    </li>
                  ))}
                {!invites.filter((i) => !i.acceptedAt).length && (
                  <li className="text-muted-foreground">No pending invites.</li>
                )}
              </ul>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Only organization admins can invite teammates.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function JurisdictionCard() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.getSettings(),
  });
  const saved = data?.jurisdiction ?? "";
  // Local draft shows the pick immediately; cleared once the server confirms and
  // the query reflects the new value.
  const [draft, setDraft] = useState<string | null>(null);
  const jurisdiction = draft ?? saved;

  const saveMutation = useMutation({
    mutationFn: (next: string) => api.setSettings(next || null),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["settings"] });
      setDraft(null);
      toast.success("Jurisdiction updated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  function save(next: string) {
    setDraft(next);
    saveMutation.mutate(next);
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

const PROVIDER_META: Record<LlmProvider, { label: string; placeholder: string; note?: string }> = {
  anthropic: { label: "Claude (Anthropic)", placeholder: "sk-ant-…" },
  openai: { label: "OpenAI", placeholder: "sk-…" },
  gemini: { label: "Google Gemini", placeholder: "AIza…" },
  openrouter: {
    label: "OpenRouter",
    placeholder: "sk-or-…",
    note: "Zero data retention by default — the safest out-of-the-box choice.",
  },
};

function ProviderKeys() {
  const { data } = useQuery({
    queryKey: ["keys"],
    queryFn: () => api.getKeys(),
  });
  const providers = data?.providers ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>LLM provider keys</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-stack">
        <p className="text-sm text-muted-foreground">
          Bring your own key for any provider. Encrypted at rest, used to run chat and cell
          extraction. Your key overrides any server key; pick the model per chat or review.
        </p>
        {providers.map((p) => (
          <ProviderRow key={p.provider} status={p} />
        ))}
      </CardContent>
    </Card>
  );
}

function ProviderRow({ status }: { status: ProviderKeyStatus }) {
  const qc = useQueryClient();
  const meta = PROVIDER_META[status.provider];
  const [key, setKey] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["keys"] });

  const saveMutation = useMutation({
    mutationFn: () => api.setKey(status.provider, key.trim()),
    onSuccess: () => {
      setKey("");
      void invalidate();
      toast.success(`${meta.label} key saved`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const removeMutation = useMutation({
    mutationFn: () => api.deleteKey(status.provider),
    onSuccess: () => {
      void invalidate();
      toast.success(`${meta.label} key removed`);
    },
  });

  function save() {
    if (!key.trim()) return;
    saveMutation.mutate();
  }

  return (
    <div className="flex flex-col gap-field border-t border-border pt-stack first:border-t-0 first:pt-0">
      <div className="flex items-center gap-2">
        <Label className="flex-1">{meta.label}</Label>
        {status.source === "user" ? (
          <Badge variant="secondary">your key</Badge>
        ) : status.source === "env" ? (
          <Badge variant="outline">server key</Badge>
        ) : (
          <Badge variant="outline">not set</Badge>
        )}
      </div>
      {meta.note && <p className="text-xs text-muted-foreground">{meta.note}</p>}
      <div className="flex gap-2">
        <Input
          type="password"
          placeholder={meta.placeholder}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <Button onClick={save} disabled={saveMutation.isPending || !key.trim()}>
          Save
        </Button>
        {status.hasUserKey && (
          <Button variant="ghost" onClick={() => removeMutation.mutate()}>
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}

const CONNECT_TABS = ["ChatGPT", "Claude", "Claude Code", "Codex"] as const;
type ConnectTab = (typeof CONNECT_TABS)[number];

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="mt-1 block rounded bg-muted p-2 text-xs break-all whitespace-pre-wrap">
      {children}
    </code>
  );
}

function ConnectAgent() {
  const qc = useQueryClient();
  const { data: tokens = [] } = useQuery({
    queryKey: ["tokens"],
    queryFn: () => api.listTokens(),
  });
  const [label, setLabel] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [tab, setTab] = useState<ConnectTab>("ChatGPT");

  const mcpUrl = typeof window !== "undefined" ? `${window.location.origin}/api/mcp` : "/api/mcp";
  const usesOAuth = tab === "ChatGPT" || tab === "Claude";

  const invalidate = () => qc.invalidateQueries({ queryKey: ["tokens"] });

  const mintMutation = useMutation({
    mutationFn: () => api.mintToken(label.trim() || "default"),
    onSuccess: ({ token }) => {
      setFresh(token);
      setLabel("");
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
          gitcounsel exposes an MCP server at <code className="text-xs">{mcpUrl}</code>. Connect
          your own AI client — every action it takes is recorded in the same commit history,
          attributed as an agent. It can drive product features but never your account settings.
        </p>

        {/* Client tabs */}
        <div className="flex flex-wrap gap-1.5">
          {CONNECT_TABS.map((t) => (
            <Button
              key={t}
              size="sm"
              variant={tab === t ? "default" : "outline"}
              onClick={() => setTab(t)}
            >
              {t}
            </Button>
          ))}
        </div>

        {/* Per-client guide */}
        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
          {tab === "ChatGPT" && (
            <div className="flex flex-col gap-1">
              <p className="font-medium">ChatGPT — Developer Mode (paid plans)</p>
              <p className="text-muted-foreground">
                Settings → Connectors → add a custom connector with the server URL below. ChatGPT
                runs the OAuth login and approval page — no token to paste. Needs the server on
                public HTTPS.
              </p>
              <Code>{mcpUrl}</Code>
            </div>
          )}
          {tab === "Claude" && (
            <div className="flex flex-col gap-1">
              <p className="font-medium">Claude Desktop / web — custom connector</p>
              <p className="text-muted-foreground">
                Add a connector with the URL below for the OAuth login + approval. Prefer a static
                token instead? Mint one below and use the{" "}
                <code className="text-xs">mcp-remote</code> bridge with an{" "}
                <code className="text-xs">Authorization: Bearer</code> header.
              </p>
              <Code>{mcpUrl}</Code>
            </div>
          )}
          {tab === "Claude Code" && (
            <div className="flex flex-col gap-1">
              <p className="font-medium">Claude Code CLI — static token</p>
              <p className="text-muted-foreground">Mint a token below, then run:</p>
              <Code>{`claude mcp add --transport http gitcounsel ${mcpUrl} \\\n  --header "Authorization: Bearer <token>"`}</Code>
            </div>
          )}
          {tab === "Codex" && (
            <div className="flex flex-col gap-1">
              <p className="font-medium">Codex CLI — static token</p>
              <p className="text-muted-foreground">
                Mint a token below, set <code className="text-xs">GITCOUNSEL_TOKEN</code>, then add
                to <code className="text-xs">~/.codex/config.toml</code>:
              </p>
              <Code>{`[mcp_servers.gitcounsel]\nurl = "${mcpUrl}"\nbearer_token_env_var = "GITCOUNSEL_TOKEN"`}</Code>
            </div>
          )}
        </div>

        {/* Static token minting — used by Claude Code, Codex, and the Claude token fallback */}
        {!usesOAuth || tab === "Claude" ? (
          <div className="flex flex-col gap-3 border-t border-border pt-stack">
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
              <Button onClick={() => mintMutation.mutate()} disabled={mintMutation.isPending}>
                {mintMutation.isPending ? "Minting…" : "Mint token"}
              </Button>
            </div>

            {fresh && (
              <div className="rounded-md border border-bronze/40 bg-bronze-tint p-3 text-sm">
                <p className="font-medium">Copy this token now — it won't be shown again:</p>
                <Code>{fresh}</Code>
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
                      <Button size="xs" variant="ghost" onClick={() => revokeMutation.mutate(t.id)}>
                        Revoke
                      </Button>
                    </li>
                  ))}
                {!tokens.filter((t) => !t.revokedAt).length && (
                  <li className="text-muted-foreground">No active tokens.</li>
                )}
              </ul>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            ChatGPT connects over OAuth — no token needed here.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
