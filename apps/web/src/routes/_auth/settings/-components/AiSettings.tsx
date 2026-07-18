import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Scale } from "lucide-react";
import { toast } from "sonner";
import { JURISDICTIONS, sourcesFor } from "@workspace/registry";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type LlmProvider, type ProviderKeyStatus } from "@/lib/data/api";

export function JurisdictionCard() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.getSettings(),
  });
  const saved = data?.jurisdiction ?? "";
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
  const sources = sourcesFor(effective);
  const toolCount = sources.reduce((total, source) => total + source.tools.length, 0);

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
        <div className="rounded-lg border border-border/70 bg-muted/40 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Available tools</p>
              <p className="text-sm font-medium">Tools for {effective}</p>
            </div>
            <Badge variant={toolCount ? "secondary" : "outline"}>{toolCount || "No"} tools</Badge>
          </div>

          {sources.length ? (
            <div className="mt-3 divide-y divide-border/70">
              {sources.map((source) => (
                <section key={source.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-bronze" />
                    <p className="text-sm font-medium">{source.name}</p>
                    <span className="text-xs text-muted-foreground">
                      {source.tools.length} {source.tools.length === 1 ? "tool" : "tools"}
                    </span>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {source.tools.map((tool) => (
                      <div
                        key={tool.name}
                        className="flex min-w-0 gap-2 rounded-md border border-border/60 bg-card/70 p-2.5"
                      >
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground">
                          <Scale className="size-3.5" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{tool.label}</p>
                          <p className="text-xs leading-5 text-muted-foreground">{tool.summary}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No legal research tools are available for this jurisdiction yet.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const PROVIDER_META: Record<LlmProvider, { label: string; placeholder: string; note?: string }> = {
  anthropic: { label: "Claude (Anthropic)", placeholder: "sk-ant-..." },
  openai: { label: "OpenAI", placeholder: "sk-..." },
  gemini: { label: "Google Gemini", placeholder: "AIza..." },
  openrouter: {
    label: "OpenRouter",
    placeholder: "sk-or-...",
    note: "Zero data retention by default - the safest out-of-the-box choice.",
  },
};

export function ProviderKeys() {
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
        {providers.map((provider) => (
          <ProviderRow key={provider.provider} status={provider} />
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
      {status.hasUserKey && (
        <p className="text-xs text-muted-foreground">
          Your key is encrypted and cannot be viewed or retrieved here. Enter a new key to replace
          it.
        </p>
      )}
      <div className="flex gap-2">
        <Input
          type="password"
          placeholder={status.hasUserKey ? "Enter a new key to replace it" : meta.placeholder}
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
