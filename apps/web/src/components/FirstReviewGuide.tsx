import { useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FirstReviewStatus } from "@workspace/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/data/api";
import { useDocumentUpload } from "@/routes/_auth/documents/-hooks/useDocumentUpload";
import { ContractReviewSetup } from "@/routes/_auth/matters/-components/ContractReviewSetup";

type ExecutionRoute = "application" | "agent";

const REGIONS = {
  eu: "European Union document storage",
  us: "United States document storage",
  au: "Australia document storage",
  legacy: "Existing document-storage configuration",
};

/** Read-only status links the existing legal workflow; local choices never mark work complete. */
export function FirstReviewGuide({
  matterId,
  onChooseMatter,
}: {
  matterId?: string;
  onChooseMatter: (matterId: string) => void;
}) {
  const status = useQuery({
    queryKey: ["first-review", matterId],
    queryFn: () => api.getFirstReviewStatus(matterId),
    refetchInterval: 10000,
  });
  if (status.isPending)
    return <Skeleton className="h-48 w-full" aria-label="Loading first-review progress" />;
  if (status.error || !status.data)
    return (
      <Alert variant="destructive">
        <AlertTitle>Review progress could not be loaded</AlertTitle>
        <AlertDescription>
          <p>Your permissions or the selected matter may have changed.</p>
          <Button size="sm" variant="outline" onClick={() => void status.refetch()}>
            Retry loading
          </Button>
          {matterId ? (
            <Button size="sm" variant="ghost" onClick={() => onChooseMatter("")}>
              Choose another matter
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  return (
    <FirstReviewJourney
      key={matterId ?? "choose"}
      status={status.data}
      onChooseMatter={onChooseMatter}
    />
  );
}

/** Exported for the synthetic acceptance fixture; all production facts come from the status API. */
export function FirstReviewJourney({
  status,
  onChooseMatter,
}: {
  status: FirstReviewStatus;
  onChooseMatter: (matterId: string) => void;
}) {
  const qc = useQueryClient();
  const [executionRoute, setExecutionRoute] = useState<ExecutionRoute | null>(null);
  const [model, setModel] = useState("");
  const [setupOpen, setSetupOpen] = useState(false);
  const [, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const setupRef = useRef<HTMLDivElement>(null);
  const upload = useDocumentUpload({
    matterId: status.matter?.id,
    setPagination,
    onUploaded: () => {
      void qc.invalidateQueries({ queryKey: ["first-review"] });
      void qc.invalidateQueries({ queryKey: ["matter-review-documents", status.matter?.id] });
      void qc.invalidateQueries({ queryKey: ["documents"] });
    },
  });
  const configured = status.application.providers.filter((provider) => provider.available);
  const models = configured.flatMap((provider) => provider.models);
  const applicationReady = configured.length > 0;
  const agentAuthorized = status.agent.connections.length > 0;
  const executionReady =
    executionRoute === "application"
      ? applicationReady
      : executionRoute === "agent"
        ? agentAuthorized
        : false;
  const uploadedReady = status.documents.some((document) => document.uploaded && document.ready);
  const canPrepare =
    !!status.matter?.canEdit && executionReady && status.playbooks.length > 0 && uploadedReady;
  const review = status.review;
  const findingsReady =
    !!review && review.totalFindings > 0 && review.completedFindings === review.totalFindings;

  function openSetup() {
    setSetupOpen(true);
    requestAnimationFrame(() =>
      setupRef.current?.scrollIntoView({ behavior: "instant", block: "start" })
    );
  }

  return (
    <div className="flex max-w-4xl flex-col gap-8 pb-6">
      <p className="max-w-prose text-sm text-muted-foreground">
        Complete one contract review using your firm's approved positions. Progress below comes from
        saved work; choosing an AI route or opening a step never runs a paid review.
      </p>
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">See a fictional example first</summary>
        <div className="mt-3 flex max-w-prose flex-col gap-3 text-muted-foreground">
          <p>
            Fictional demonstration only. These example positions are not a firm-approved standard.
          </p>
          <blockquote className="font-serif text-base text-foreground">
            “The recipient may disclose information required by law without notifying the disclosing
            party.”
          </blockquote>
          <p>
            Suppose an approved firm rule asks for notice where legally permitted. Review the exact
            quotation, compare it with that rule and the client's instructions, then have an
            eligible human decide whether to leave the wording, propose a change or escalate it. Any
            change and decision stays in the audit history.
          </p>
        </div>
      </details>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="first-review-matter">Matter for this review</FieldLabel>
          <select
            id="first-review-matter"
            value={status.matter?.id ?? ""}
            onChange={(event) => onChooseMatter(event.target.value)}
            className="h-9 max-w-xl rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Choose a matter</option>
            {status.matters.map((matter) => (
              <option key={matter.id} value={matter.id}>
                {matter.name}
                {matter.canEdit ? "" : " · read only"}
              </option>
            ))}
          </select>
          <FieldDescription>
            Only matters you can currently access appear here.{" "}
            <Link to="/matters" search={{ new: true }} className="underline underline-offset-4">
              Create a matter
            </Link>{" "}
            if needed.
          </FieldDescription>
          {status.mattersTruncated ? (
            <FieldDescription>
              The 100 most recently updated matters are shown. Open another matter's first-review
              guide from its overview.
            </FieldDescription>
          ) : null}
        </Field>
      </FieldGroup>

      {status.matter && !status.matter.canEdit ? (
        <Alert>
          <AlertTitle>This matter is read only for you</AlertTitle>
          <AlertDescription>
            You can inspect progress and saved findings. A matter editor or owner must prepare the
            review; an eligible human must decide changes.
          </AlertDescription>
        </Alert>
      ) : null}

      {status.matter ? (
        <ol className="flex flex-col gap-6" aria-label="First-review steps">
          <GuideStep
            number={1}
            title="Check storage and processing"
            state={status.organization.storageRegion ? "Configured" : "Needs setup"}
          >
            <p>
              {status.organization.storageRegion
                ? REGIONS[status.organization.storageRegion]
                : "Choose a document-storage region before uploading."}
              .
            </p>
            <p>
              Document storage is separate from database and backup placement. gitmatter keeps your
              documents and audit history; model providers and external agent clients have their own
              processing and retention policies.
            </p>
            <Link to="/settings" search={{ tab: "data" }} className="underline underline-offset-4">
              Review data and privacy settings
            </Link>
          </GuideStep>

          <GuideStep
            number={2}
            title="Choose how the review runs"
            state={
              executionReady
                ? "Ready to prepare"
                : executionRoute
                  ? "Needs setup"
                  : "Choose a route"
            }
          >
            <Tabs
              value={executionRoute}
              onValueChange={(value) => setExecutionRoute(value as ExecutionRoute)}
            >
              <TabsList aria-label="Review execution route">
                <TabsTrigger value="application">Application model</TabsTrigger>
                <TabsTrigger value="agent">Connected agent</TabsTrigger>
              </TabsList>
              <TabsContent value="application" className="flex flex-col gap-3 pt-3">
                <p>
                  gitmatter sends the captured document and review instructions to the selected
                  provider. Application AI limits and usage cover these calls; the review shows an
                  estimate before you run it.
                </p>
                {configured.length ? (
                  <p>
                    {configured
                      .map(
                        (provider) =>
                          `${provider.label}: ${provider.source === "user" ? "your configured key" : "server-configured key"}`
                      )
                      .join("; ")}
                    . Configuration presence does not verify a live provider response.
                  </p>
                ) : (
                  <p>
                    No application provider is configured for your account. Add one in AI settings.
                  </p>
                )}
                {models.length ? (
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="first-review-model">Preferred model</FieldLabel>
                      <select
                        id="first-review-model"
                        value={model}
                        onChange={(event) => setModel(event.target.value)}
                        className="h-9 max-w-xl rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="">Choose on the review</option>
                        {models.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.label}
                          </option>
                        ))}
                      </select>
                      <FieldDescription>
                        Confirm the current model and estimate on the review before running.
                        OpenRouter models can be searched there.
                      </FieldDescription>
                    </Field>
                  </FieldGroup>
                ) : null}
                <div className="flex flex-wrap gap-4">
                  <Link
                    to="/settings"
                    search={{ tab: "ai" }}
                    className="underline underline-offset-4"
                  >
                    AI and model settings
                  </Link>
                  <Link
                    to="/settings"
                    search={{ tab: "organization" }}
                    className="underline underline-offset-4"
                  >
                    Application AI limits and usage
                  </Link>
                </div>
              </TabsContent>
              <TabsContent value="agent" className="flex flex-col gap-3 pt-3">
                <p>
                  Your connected client reads the document and captured instructions through
                  gitmatter's tools and writes attributable findings. Its subscription or model bill
                  is separate from gitmatter's application AI limits. Check that client's data
                  policy before sending client material.
                </p>
                {agentAuthorized ? (
                  <ul className="flex flex-col gap-1">
                    {status.agent.connections.map((connection, index) => (
                      <li key={`${connection.kind}:${index}`}>
                        {connection.label} ·{" "}
                        {connection.lastUsedAt
                          ? `last used ${new Date(connection.lastUsedAt).toLocaleString()}`
                          : "authorized; no use recorded"}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    No current connection with editor scope for this matter is recorded. Connect a
                    client in Agents settings, then return here.
                  </p>
                )}
                <p>
                  {status.agent.recentlyUsed
                    ? "A permitted connection was used within the past day. This does not prove the client is online now."
                    : "Confirm the connection in your client before running the review."}
                </p>
                <Link
                  to="/settings"
                  search={{ tab: "agents" }}
                  className="underline underline-offset-4"
                >
                  Connect or inspect an agent
                </Link>
              </TabsContent>
            </Tabs>
          </GuideStep>

          <GuideStep
            number={3}
            title="Use an approved firm standard"
            state={status.playbooks.length ? "Available" : "Needs approval"}
          >
            {status.playbooks.length ? (
              <p>
                {status.playbooks
                  .map((playbook) => `${playbook.title} (${playbook.ruleCount} rules)`)
                  .join("; ")}
                . Choose the applicable standard in review setup.
              </p>
            ) : (
              <p>No approved playbook with rules is available for this matter.</p>
            )}
            <p>
              A starter or AI-drafted standard remains a draft until an eligible human firm
              administrator publishes it. The guide never approves positions for you.
            </p>
            {status.organization.canPublishFirmStandard ? (
              <Link to="/library" className="underline underline-offset-4">
                Review or publish firm positions
              </Link>
            ) : (
              <>
                <p>Ask your firm administrator to publish the firm's positions.</p>
                <Link to="/library" className="underline underline-offset-4">
                  Inspect the firm library
                </Link>
              </>
            )}
            {status.playbooksTruncated ? (
              <p>The 100 most recently updated approved standards are shown.</p>
            ) : null}
          </GuideStep>

          <GuideStep
            number={4}
            title="Upload one actual document"
            state={
              uploadedReady
                ? "Source prepared"
                : status.documentsSearchIncomplete
                  ? "Inspect more sources"
                  : "Needs source"
            }
          >
            <p>
              Use a DOCX for Word redlines and clean output. Keep the original and inspect incoming
              revisions before relying on the extracted review text. PDF review is available, but
              does not produce a clean Word counterpart.
            </p>
            {status.documents.length ? (
              <ul className="flex flex-col gap-1">
                {status.documents.slice(0, 5).map((document) => (
                  <li key={document.id}>
                    <Link
                      to="/documents/$id"
                      params={{ id: document.id }}
                      className="underline underline-offset-4"
                    >
                      {document.title}
                    </Link>{" "}
                    ·{" "}
                    {document.ready
                      ? document.uploaded
                        ? "source ready"
                        : "pasted text"
                      : document.status === "failed"
                        ? "extraction failed; inspect document"
                        : "preparing source"}
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                {status.documentsSearchIncomplete
                  ? "No readable document was found in the scanned window."
                  : "No readable document has been added to this matter."}
              </p>
            )}
            {status.matter?.canEdit ? (
              <>
                <input
                  ref={upload.fileRef}
                  type="file"
                  accept=".docx,.pdf"
                  onChange={upload.onPick}
                  className="sr-only"
                  aria-label="Upload first-review document"
                  tabIndex={-1}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={upload.uploading}
                  onClick={() => upload.fileRef.current?.click()}
                >
                  {upload.uploading ? "Uploading…" : "Upload document"}
                </Button>
              </>
            ) : null}
            {status.documentsTruncated ? (
              <p>The 100 most recent matter documents are shown.</p>
            ) : null}
            {status.documentsSearchIncomplete ? (
              <p>
                Source search reached its permission-check limit. Other readable documents may
                exist.{" "}
                <Link
                  to="/matters/$id"
                  params={{ id: status.matter.id }}
                  className="underline underline-offset-4"
                >
                  Open the matter's Documents tab
                </Link>{" "}
                to inspect its sources.
              </p>
            ) : null}
          </GuideStep>

          <GuideStep
            number={5}
            title="Capture review instructions"
            state={review?.instructionsCaptured ? "Captured" : "Needs instructions"}
          >
            <p>
              Confirm whom you represent, the disclosure role, the business purpose and
              governing-law context. Unknowns remain explicit. These instructions are saved with the
              exact source and standard when you prepare a review.
            </p>
            {review && !review.instructionsCaptured ? (
              <p>
                The latest review predates captured instructions. Prepare a new review to apply
                them; historical findings stay unchanged.
              </p>
            ) : null}
            {canPrepare ? (
              <Button size="sm" variant="outline" onClick={openSetup}>
                Prepare review and instructions
              </Button>
            ) : (
              <p>
                Choose a ready execution route, an approved standard and a prepared uploaded source
                first. You also need matter editor access.
              </p>
            )}
            {setupOpen && canPrepare && status.matter ? (
              <div ref={setupRef}>
                <ContractReviewSetup
                  matterId={status.matter.id}
                  onClose={() => setSetupOpen(false)}
                  executionRoute={executionRoute ?? undefined}
                  preferredModel={
                    models.some((candidate) => candidate.id === model) ? model : undefined
                  }
                />
              </div>
            ) : null}
          </GuideStep>

          <GuideStep
            number={6}
            title="Review cited findings"
            state={findingsReady ? "Findings prepared" : review ? "In progress" : "Needs review"}
          >
            {review ? (
              <>
                <p>
                  {review.completedFindings} of {review.totalFindings} rule findings are prepared
                  {review.failedFindings ? `; ${review.failedFindings} failed` : ""}. Open each
                  material finding and check its quotation against the captured source.
                </p>
                <Link
                  to="/reviews/$id"
                  params={{ id: review.id }}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Open {review.title}
                </Link>
              </>
            ) : (
              <p>
                Prepare the review, then explicitly run your selected model or ask your connected
                agent to populate cited findings.
              </p>
            )}
          </GuideStep>

          <GuideStep
            number={7}
            title="Make human decisions"
            state={review?.decisionsComplete ? "Decisions complete" : "Needs decisions"}
          >
            <p>
              Decide exact current proposals, leave unchanged with a reason, or escalate questions
              to the required reviewer. An agent's finding does not approve a legal change.
            </p>
            {review ? (
              <p>
                {review.unresolvedFindings} unresolved findings · {review.pendingEdits} pending
                document edits · {review.pendingApprovals} pending finding approvals.
                {review.sourceChanged
                  ? " The source changed; start a fresh review before finalising."
                  : ""}
              </p>
            ) : null}
          </GuideStep>

          <GuideStep
            number={8}
            title="Prepare the Word output"
            state={review?.cleanReady ? "Ready to request output" : "Not ready"}
          >
            <p>
              Use the review's output controls for the tracked draft, source-bound report and
              approved clean DOCX. Clean output may require a separate exact export approval.
              Download readiness does not mean a lawyer has verified the file in Word.
            </p>
            {review?.cleanReady ? (
              <Link
                to="/reviews/$id"
                params={{ id: review.id }}
                className="underline underline-offset-4"
              >
                Open output controls
              </Link>
            ) : (
              <p>
                Complete decisions, resolve tracked edits and use a supported current DOCX baseline
                before requesting clean output.
              </p>
            )}
          </GuideStep>
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">
          Choose a matter to see its approved standards, documents and saved review progress.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Progress reflects the latest readable contract review among the 20 most recent in this
        matter.{" "}
        {status.reviewSearchIncomplete
          ? "No readable review was found in that window; older work may exist. "
          : ""}
        Checked {new Date(status.capturedAt).toLocaleString()}.
      </p>
      <div className="flex flex-wrap gap-4 text-sm">
        <Link to="/assistant" className="underline underline-offset-4">
          Open Assistant
        </Link>
        {status.matter ? (
          <Link
            to="/matters/$id"
            params={{ id: status.matter.id }}
            className="underline underline-offset-4"
          >
            Return to matter
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function GuideStep({
  number,
  title,
  state,
  children,
}: {
  number: number;
  title: string;
  state: string;
  children: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-3 border-b border-border pb-6 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">
          {number}. {title}
        </h2>
        <Badge variant="secondary">{state}</Badge>
      </div>
      <div className="flex max-w-prose flex-col items-start gap-3 text-sm text-muted-foreground">
        {children}
      </div>
    </li>
  );
}
