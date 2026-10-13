import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  jobControlPolicySchema,
  type JobControlPolicy,
  type JobControlsSnapshot,
} from "@workspace/contracts";
import { toast } from "sonner";
import { api } from "@/lib/data/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const tokenFields = [
  ["tenantTokenLimit", "Organization tokens"],
  ["userTokenLimit", "Tokens per user"],
  ["matterTokenLimit", "Tokens per matter"],
  ["tokenTokenLimit", "Tokens per scoped agent"],
  ["runTokenLimit", "Tokens per review run"],
] as const;
const numberValue = (value: number) => (Number.isFinite(value) ? value : "");
const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 4,
  }).format(value);

export function JobControls() {
  const query = useQuery({ queryKey: ["job-controls"], queryFn: api.getJobControls, retry: false });
  if (query.isPending)
    return <Skeleton className="h-24 w-full" aria-label="Loading review limits" />;
  if (query.isError)
    return (
      <Alert>
        <AlertTitle>Review limits unavailable</AlertTitle>
        <AlertDescription>
          Only organization admins can manage these controls. If you are an admin, retry after
          checking your connection.
          <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  return <ControlsForm key={query.data.revision} snapshot={query.data} />;
}

function ControlsForm({ snapshot }: { snapshot: JobControlsSnapshot }) {
  const qc = useQueryClient();
  const [policy, setPolicy] = useState(snapshot.effective);
  const [reason, setReason] = useState("");
  const [showAttribution, setShowAttribution] = useState(false);
  const attribution = useQuery({
    queryKey: ["job-usage-attribution", snapshot.revision],
    queryFn: api.getJobUsageAttribution,
    enabled: showAttribution,
  });
  const parsed = jobControlPolicySchema.safeParse(policy);
  const changed = JSON.stringify(policy) !== JSON.stringify(snapshot.effective);
  const save = useMutation({
    mutationFn: () =>
      api.setJobControls({ expectedRevision: snapshot.revision, reason: reason.trim(), policy }),
    onSuccess: (updated) => {
      qc.setQueryData(["job-controls"], updated);
      toast.success("Review limits saved");
    },
    onError: () => {
      toast.error("Limits could not be saved. Reload to check for changes by another admin.");
    },
  });
  const change = (key: keyof JobControlPolicy, value: number) =>
    setPolicy((previous) => ({ ...previous, [key]: value }));
  return (
    <Card>
      <CardHeader>
        <CardTitle>AI limits and usage</CardTitle>
        <CardDescription>
          Control GitMatter model calls for this organization, including queued reviews, chat,
          single-rule reviews and prompt generation. Limits are checked before dispatch. Your
          connected agent's own subscription and external service fees are outside these limits.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-stack">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Known usage in this window</dt>
            <dd className="tabular-nums">
              {snapshot.usage.knownTokens.toLocaleString()} tokens ·{" "}
              {money(snapshot.usage.knownEstimatedUsd)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Reserved or uncertain usage</dt>
            <dd className="tabular-nums">
              {snapshot.usage.heldTokens.toLocaleString()} tokens ·{" "}
              {money(snapshot.usage.heldEstimatedUsd)}
            </dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">
          Dollar amounts are estimates for priced attempts. {snapshot.usage.unpricedAttempts}{" "}
          unpriced attempts are excluded. Outstanding reservations stay held until their paid
          outcome is known. {snapshot.capacity.queued} jobs waiting, {snapshot.capacity.running}{" "}
          running, {snapshot.capacity.failed} failed.
        </p>
        <Button
          variant="outline"
          size="sm"
          render={<a href="/api/admin/job-controls/usage?format=csv" />}
        >
          Download usage CSV
        </Button>
        <details onToggle={(event) => setShowAttribution(event.currentTarget.open)}>
          <summary className="cursor-pointer text-sm font-medium">
            Usage by matter, account and model
          </summary>
          {attribution.isLoading && <Skeleton className="mt-3 h-20 w-full" />}
          {attribution.isError && (
            <Alert variant="destructive">
              <AlertTitle>Usage could not be loaded</AlertTitle>
              <AlertDescription>
                <Button variant="ghost" size="sm" onClick={() => void attribution.refetch()}>
                  Retry usage
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {attribution.data && (
            <Table containerClassName="mt-3">
              <caption className="sr-only">
                Provider usage for the configured window, grouped by UTC day. Reserved and uncertain
                attempts are included separately.
              </caption>
              <TableHeader>
                <TableRow>
                  <TableHead>UTC day / matter</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Provider / model</TableHead>
                  <TableHead>Known tokens</TableHead>
                  <TableHead>Held tokens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attribution.data.slice(0, 50).map((row, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      {row.day}
                      <br />
                      <span className="text-xs text-muted-foreground">
                        {row.matterId ?? "Restricted or unassigned"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {row.actorType === "agent" ? (row.agentLabel ?? "Agent") : "Person"}
                      <br />
                      <span className="text-xs text-muted-foreground">{row.actorId}</span>
                    </TableCell>
                    <TableCell>
                      {row.provider ?? "Unknown"}
                      <br />
                      <span className="text-xs text-muted-foreground">{row.model}</span>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {row.knownTokens.toLocaleString()}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {row.heldTokens.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {attribution.data?.length === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              No provider attempts in this window.
            </p>
          )}
          {!!attribution.data?.length && (
            <p className="mt-3 text-xs text-muted-foreground">
              Showing up to 50 groups. Download CSV for up to 5,000 groups; dollar estimates exclude
              unpriced attempts.
            </p>
          )}
        </details>
        <Separator />
        <form
          className="flex flex-col gap-stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (parsed.success && changed && reason.trim()) save.mutate();
          }}
        >
          <FieldSet disabled={save.isPending}>
            <FieldLegend>Spend window</FieldLegend>
            <FieldDescription>
              Token and dollar limits apply within this window. Zero disables a spend limit.
              Reducing a limit stops new dispatches; it does not undo completed work or charges
              already incurred.
            </FieldDescription>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="budget-window">Window in minutes</FieldLabel>
                <Input
                  id="budget-window"
                  type="number"
                  min={1}
                  max={43200}
                  required
                  value={numberValue(policy.budgetWindowMinutes)}
                  onChange={(event) => change("budgetWindowMinutes", event.target.valueAsNumber)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="cost-limit">Organization dollar limit (USD)</FieldLabel>
                <Input
                  id="cost-limit"
                  type="number"
                  min={0}
                  max={1000000}
                  step="0.01"
                  required
                  value={numberValue(policy.tenantCostLimitUsd)}
                  onChange={(event) => change("tenantCostLimitUsd", event.target.valueAsNumber)}
                />
              </Field>
              {tokenFields.map(([key, label]) => (
                <Field key={key}>
                  <FieldLabel htmlFor={key}>{label}</FieldLabel>
                  <Input
                    id={key}
                    type="number"
                    min={0}
                    max={2147483647}
                    step={1}
                    required
                    value={numberValue(policy[key])}
                    onChange={(event) => change(key, event.target.valueAsNumber)}
                  />
                </Field>
              ))}
            </FieldGroup>
          </FieldSet>
          <details>
            <summary className="cursor-pointer text-sm font-medium">Concurrent work</summary>
            <FieldSet className="mt-4" disabled={save.isPending}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="tenant-concurrency">
                    Concurrent jobs per organization
                  </FieldLabel>
                  <Input
                    id="tenant-concurrency"
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    required
                    value={numberValue(policy.tenantConcurrency)}
                    onChange={(event) => change("tenantConcurrency", event.target.valueAsNumber)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="user-concurrency">Concurrent jobs per user</FieldLabel>
                  <Input
                    id="user-concurrency"
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    required
                    value={numberValue(policy.userConcurrency)}
                    onChange={(event) => change("userConcurrency", event.target.valueAsNumber)}
                  />
                </Field>
                {(["anthropic", "gemini", "openai", "openrouter"] as const).map((provider) => (
                  <Field key={provider}>
                    <FieldLabel htmlFor={`capacity-${provider}`}>
                      {provider === "gemini"
                        ? "Gemini"
                        : provider === "anthropic"
                          ? "Anthropic"
                          : provider === "openai"
                            ? "OpenAI"
                            : "OpenRouter"}{" "}
                      concurrent reviews
                    </FieldLabel>
                    <Input
                      id={`capacity-${provider}`}
                      type="number"
                      min={1}
                      max={100}
                      step={1}
                      required
                      value={numberValue(policy.providerConcurrency[provider])}
                      onChange={(event) =>
                        setPolicy((previous) => ({
                          ...previous,
                          providerConcurrency: {
                            ...previous.providerConcurrency,
                            [provider]: event.target.valueAsNumber,
                          },
                        }))
                      }
                    />
                  </Field>
                ))}
              </FieldGroup>
            </FieldSet>
          </details>
          <Field>
            <FieldLabel htmlFor="limit-reason">Reason for this change</FieldLabel>
            <Input
              id="limit-reason"
              value={reason}
              maxLength={1000}
              required
              disabled={save.isPending}
              onChange={(event) => setReason(event.target.value)}
            />
            <FieldDescription>
              Recorded in the organization security audit. Keep client and document content out of
              this note.
            </FieldDescription>
          </Field>
          {!parsed.success && (
            <Alert variant="destructive">
              <AlertTitle>Check the limits</AlertTitle>
              <AlertDescription>
                Use whole nonnegative token limits, a positive window, and concurrency between 1 and
                100.
              </AlertDescription>
            </Alert>
          )}
          {save.isError && (
            <Button
              type="button"
              variant="outline"
              onClick={() => void qc.invalidateQueries({ queryKey: ["job-controls"] })}
            >
              Reload current limits
            </Button>
          )}
          <Button
            type="submit"
            disabled={save.isPending || !parsed.success || !changed || !reason.trim()}
          >
            {save.isPending ? "Saving…" : "Save review limits"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
