import { FieldDescription } from "@/components/ui/field";
import { notifySuccess } from "@/lib/feedback";
import { FormFeedback } from "@/components/FormFeedback";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { JURISDICTIONS, sourcesFor } from "@workspace/registry";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type LlmProvider, type ProviderKeyStatus } from "@/lib/data/api";
import { useSettingsDraft } from "./SettingsDrafts";
import { SettingsQueryNotice, settingsSnapshotVisible } from "./SettingsQueryNotice";

export function JurisdictionCard() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.getSettings(),
  });
  const saved = query.data?.jurisdiction ?? "";
  const [draft, setDraft] = useState<string | null>(null);
  const jurisdiction = draft ?? saved;

  const saveMutation = useMutation({
    mutationFn: (next: string) => api.setSettings(next || null),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["settings"] });
      setDraft(null);
      notifySuccess("Jurisdiction updated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  function save(next: string) {
    setDraft(next);
    saveMutation.mutate(next);
  }

  const effective = saved || "US";
  useSettingsDraft(draft !== null && draft !== saved, saveMutation.isPending);
  const sources = sourcesFor(effective);
  const toolCount = sources.reduce((total, source) => total + source.tools.length, 0);

  return (
    <Card variant="section">
      <CardHeader>
        <CardTitle>Default jurisdiction</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <FormFeedback error={saveMutation.error} title="Jurisdiction was not saved" />
        <p className="text-sm text-muted-foreground">
          Dictates which legal tools are available. Individual contracts can override this.
        </p>
        <NativeSelect
          aria-label="Default jurisdiction"
          disabled={saveMutation.isPending || !query.isSuccess}
          className="w-full"
          value={jurisdiction}
          onChange={(e) => save(e.target.value)}
        >
          <NativeSelectOption value="">System default (US)</NativeSelectOption>
          {JURISDICTIONS.map((j) => (
            <NativeSelectOption key={j.code} value={j.code}>
              {j.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {saveMutation.isError && (
          <Button
            variant="outline"
            disabled={saveMutation.isPending || !query.isSuccess}
            onClick={() => save(jurisdiction)}
          >
            Retry jurisdiction save
          </Button>
        )}
        <SettingsQueryNotice query={query} label="Jurisdiction" />
        {settingsSnapshotVisible(query) && (
          <div className="pt-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Research tools for {effective}</p>
              </div>
              <Badge variant={toolCount ? "secondary" : "outline"}>{toolCount || "No"} tools</Badge>
            </div>

            {sources.length ? (
              <div className="mt-3 divide-y divide-border/70">
                {sources.map((source) => (
                  <section key={source.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{source.name}</p>
                      <span className="text-xs text-muted-foreground">
                        {source.tools.length} {source.tools.length === 1 ? "tool" : "tools"}
                      </span>
                    </div>
                    <dl className="mt-2 space-y-3">
                      {source.tools.map((tool) => (
                        <div key={tool.name} className="min-w-0">
                          <dt className="text-sm">{tool.label}</dt>
                          <dd className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                            {tool.summary}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                No legal research tools are available for this jurisdiction yet.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const PROVIDER_META: Record<LlmProvider, { label: string; placeholder: string; note?: string }> = {
  anthropic: {
    label: "Claude (Anthropic)",
    placeholder: "sk-ant-...",
    note: "Retention depends on your Anthropic agreement, model and features. A saved key does not establish zero retention.",
  },
  openai: {
    label: "OpenAI",
    placeholder: "sk-...",
    note: "Requests disable response storage. Abuse-monitoring retention and any approved zero-retention arrangement are separate.",
  },
  gemini: {
    label: "Google Gemini",
    placeholder: "AIza...",
    note: "Verify your project's billing status and data-use terms with Google. gitmatter does not check paid-service eligibility.",
  },
  openrouter: {
    label: "OpenRouter",
    placeholder: "sk-or-...",
    note: "Data-collection filtering is enabled. This does not establish zero retention; review OpenRouter, the routed provider and your account settings.",
  },
};

export function ProviderKeys() {
  const query = useQuery({
    queryKey: ["keys"],
    queryFn: () => api.getKeys(),
  });
  const providers = settingsSnapshotVisible(query) ? (query.data?.providers ?? []) : [];

  return (
    <Card variant="section">
      <CardHeader>
        <CardTitle>LLM provider keys</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-stack">
        <p className="text-sm text-muted-foreground">
          Bring your own key for any provider. Encrypted at rest, used to run chat and cell
          extraction. Your saved key takes precedence; removing it can make a configured server key
          active. Pick the model per chat or review and verify its service and account terms.
        </p>
        <SettingsQueryNotice query={query} label="Provider configuration" />
        {providers.map((provider) => (
          <ProviderRow key={provider.provider} status={provider} unavailable={!query.isSuccess} />
        ))}
      </CardContent>
    </Card>
  );
}

function ProviderRow({ status, unavailable }: { status: ProviderKeyStatus; unavailable: boolean }) {
  const qc = useQueryClient();
  const meta = PROVIDER_META[status.provider];
  const [key, setKey] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["keys"] });

  const saveMutation = useMutation({
    mutationFn: () => api.setKey(status.provider, key.trim()),
    onSuccess: () => {
      setKey("");
      void invalidate();
      notifySuccess(`${meta.label} key saved`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const removeMutation = useMutation({
    mutationFn: () => api.deleteKey(status.provider),
    onSuccess: () => {
      void invalidate();
      notifySuccess(`${meta.label} key removed`);
    },
  });

  function save() {
    if (!key.trim()) return;
    saveMutation.mutate();
  }
  const saving = saveMutation.isPending || removeMutation.isPending;
  const busy = saving || unavailable;
  useSettingsDraft(Boolean(key), saving);

  return (
    <div className="flex flex-col gap-field border-t border-border pt-stack first:border-t-0 first:pt-0">
      <FormFeedback
        error={saveMutation.error || removeMutation.error}
        title="Provider configuration was not saved"
      />
      <div className="flex items-center gap-2">
        <Label htmlFor={`provider-key-${status.provider}`} className="flex-1">
          {meta.label}
        </Label>
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
          id={`provider-key-${status.provider}`}
          aria-describedby={`provider-key-${status.provider}-hint`}
          disabled={busy}
          autoComplete="off"
          type="password"
          placeholder={status.hasUserKey ? "Enter a new key to replace it" : meta.placeholder}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <Button onClick={save} disabled={busy || !key.trim()}>
          {saveMutation.isPending ? "Saving…" : "Save"}
        </Button>
        {status.hasUserKey && (
          <Button variant="ghost" disabled={busy} onClick={() => removeMutation.mutate()}>
            {removeMutation.isPending ? "Removing…" : "Remove"}
          </Button>
        )}
      </div>
      <FieldDescription id={`provider-key-${status.provider}-hint`}>
        {unavailable
          ? "Refresh provider configuration before changing this key."
          : "Enter a key to enable Save. Saving configures this provider; it does not start an AI run."}
      </FieldDescription>
    </div>
  );
}
