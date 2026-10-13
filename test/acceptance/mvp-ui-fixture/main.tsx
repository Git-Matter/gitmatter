import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useRouterState,
  type AnyRoute,
} from "@tanstack/react-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { ContractReviewWorkspace } from "@/routes/_auth/reviews/-components/ContractReviewWorkspace";
import { ContractReviewCompletion } from "@/routes/_auth/reviews/-components/ContractReviewActions";
import { MatterOverview } from "@/routes/_auth/matters/-components/MatterOverview";
import { AgentActivity } from "@/routes/_auth/matters/-components/AgentActivity";
import { JobControls } from "@/routes/_auth/settings/-components/JobControls";
import { Toaster } from "@/components/ui/sonner";
import { Route as ProductionDocumentRoute } from "@/routes/_auth/documents/$id";
import { api, type Cell, type ReviewCompletion } from "@/lib/data/api";
import type { ApprovalProposal, JobSnapshot } from "@workspace/contracts";
import manifest from "../../../packages/core/test/fixtures/nda/manifest.json";
import docxUrl from "../../../packages/core/test/fixtures/nda/source.docx?url";
import "@/styles/globals.css";

const ids = {
  matter: "10000000-0000-4000-8000-000000000001",
  review: "10000000-0000-4000-8000-000000000002",
  document: "10000000-0000-4000-8000-000000000003",
  source: "10000000-0000-4000-8000-000000000004",
  proposal: "10000000-0000-4000-8000-000000000005",
  job: "10000000-0000-4000-8000-000000000006",
};
const fixedAt = "2026-10-13T02:00:00.000Z";
type Scenario = "partial" | "failed" | "invalid" | "stale" | "complete" | "viewer";
let scenario: Scenario = "partial";
let disposition: "left_unchanged" | "escalated" | null = null;
let rationale = "";
let proposed = false;
let eventRead = false;
let exportStatus: "pending" | "applied" | "rejected" | "withdrawn" = "pending";
let exportRequestId: string | undefined;
const decided = new Map<string, "applied" | "rejected">();
let documentDecision: "pending" | "accepted" | "rejected" = "pending";
let controlsRevision = 1;
let controlPolicy = {
  budgetWindowMinutes: 1440,
  tenantTokenLimit: 500000,
  userTokenLimit: 100000,
  matterTokenLimit: 100000,
  tokenTokenLimit: 50000,
  runTokenLimit: 30000,
  tenantCostLimitUsd: 20,
  tenantConcurrency: 4,
  userConcurrency: 2,
  providerConcurrency: { anthropic: 2, gemini: 2, openai: 2, openrouter: 2 },
};
const sourceText = manifest.paragraphs.join("\n\n");
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

function cellFixtures(): Cell[] {
  return manifest.findings.map((finding, index) => ({
    id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    documentId: ids.document,
    columnIndex: index,
    content:
      scenario === "failed" && index === 2
        ? null
        : {
            summary: finding.summary,
            flag: finding.flag as "green" | "red",
            reasoning: finding.reasoning,
          },
    citations: finding.quote
      ? [
          {
            quote:
              scenario === "invalid" && index === 1
                ? "A quotation not present in this source."
                : finding.quote,
          },
        ]
      : [],
    status: scenario === "failed" && index === 2 ? "error" : "done",
    lastCommitId: `finding-${index}`,
    blame: {
      id: `finding-${index}`,
      seq: index + 1,
      op: "write_cell",
      message: "Synthetic fixture finding",
      actorType: "agent",
      agentLabel: "Synthetic review worker",
      actorId: "synthetic-human",
      actorName: "Synthetic reviewer",
      actorEmail: null,
      createdAt: fixedAt,
    },
  }));
}
function completionFixture(): ReviewCompletion {
  const cells = cellFixtures();
  const findings = manifest.rules.map((rule, index) => ({
    columnIndex: index,
    cellId: cells[index]!.id,
    ruleId: rule.id,
    name: rule.clauseType,
    severity: rule.severity as "red",
    standardPosition: rule.standardPosition,
    finding:
      scenario === "failed" && index === 2
        ? null
        : {
            revisionId: `finding-${index}`,
            sourceVersionId: ids.source,
            sourceHeadCommitId: "source-commit",
            ruleId: rule.id,
            outcome:
              index === 0
                ? ("conforms" as const)
                : index === 3
                  ? ("not_found" as const)
                  : scenario === "invalid" && index === 1
                    ? ("inconclusive" as const)
                    : ("deviates" as const),
            citationsValid: scenario !== "invalid" || index !== 1,
          },
    disposition:
      scenario === "complete"
        ? "left_unchanged"
        : index === 1 && disposition
          ? disposition
          : index === 1 && proposed
            ? "redline_proposed"
            : "needs_attention",
    rationale:
      index === 1 && rationale
        ? rationale
        : scenario === "complete"
          ? "Synthetic human acceptance rationale."
          : null,
    addressed:
      scenario === "complete" || index === 0 || (index === 1 && disposition === "left_unchanged"),
    clauses: [
      {
        id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        title: `${rule.clauseType} — synthetic standard`,
        revision: `synthetic-approved-clause-${index}`,
        body: rule.standardPosition,
      },
      ...rule.fallbacks.map((body, fallback) => ({
        id: `40000000-0000-4000-8000-${String(index * 10 + fallback + 1).padStart(12, "0")}`,
        title: `${rule.clauseType} — synthetic fallback`,
        revision: `synthetic-fallback-${index}`,
        body,
      })),
    ],
  }));
  return {
    canDecide: scenario !== "viewer",
    canEscalate: scenario !== "viewer",
    policyRevision: 2,
    requiredFindingRole: "owner",
    reviewId: ids.review,
    matterId: ids.matter,
    reviewCommitId: "synthetic-review-commit",
    playbookId: "synthetic-playbook",
    playbookRevision: "synthetic-playbook-approved-v1",
    capturedAt: fixedAt,
    cleanReady: scenario === "complete",
    decisionsComplete: scenario === "complete",
    documents: [
      {
        canPropose: scenario !== "viewer",
        reviewedText: sourceText,
        documentId: ids.document,
        title: "Synthetic mutual NDA.docx",
        editableDocx: true,
        reviewedVersionId: ids.source,
        currentVersionId:
          scenario === "stale" || proposed ? "50000000-0000-4000-8000-000000000001" : ids.source,
        approvedVersionId: ids.source,
        approvedBaselineReady: !proposed,
        currentHeadCommitId: "synthetic-source-commit",
        sourceChanged: scenario === "stale",
        unfinished: scenario === "failed" ? 1 : 0,
        unresolved: findings.filter((finding) => !finding.addressed).length,
        pendingEdits: proposed ? 1 : 0,
        pendingApprovals: 0,
        findings,
        cleanReady: scenario === "complete",
        decisionsComplete: scenario === "complete",
      },
    ],
  };
}
function jobFixture(): JobSnapshot {
  return {
    id: ids.job,
    kind: "review_cell",
    documentId: ids.document,
    columnIndex: 2,
    artifactId: ids.review,
    state: scenario === "failed" ? "failed" : "succeeded",
    revision: 1,
    attempts: 1,
    maxAttempts: 6,
    completed: scenario === "failed" ? 0 : 1,
    total: 1,
    errorCode: scenario === "failed" ? "provider_outcome_unknown" : null,
    nextAttemptAt: fixedAt,
    cancellationRequestedAt: null,
    resultCommitId: "synthetic-result",
    updatedAt: fixedAt,
    usage: {
      uncertainAttempts: scenario === "failed" ? 1 : 0,
      knownTokens: 1200,
      heldTokenEstimate: scenario === "failed" ? 2000 : 0,
      knownEstimatedUsd: 0.01,
      heldEstimatedUsd: scenario === "failed" ? 0.02 : 0,
    },
  };
}
function proposalFixture(): ApprovalProposal {
  return {
    id: ids.proposal,
    kind: "export",
    matterId: ids.matter,
    artifactId: ids.document,
    revision: 1,
    proposalCommitId: "synthetic-export-request",
    contentHash: "a".repeat(64),
    policyRevision: 2,
    requiredRole: "owner",
    proposerId: "synthetic-human",
    agentLabel: null,
    status: exportStatus,
    lastCommitId: "synthetic-export-request",
    createdAt: fixedAt,
    policyChanged: false,
    stale: scenario === "stale",
    mayDecide: scenario !== "viewer",
    // Mirror server getProposal: applied, current snapshot/policy, original requester.
    mayRetrieve: exportStatus === "applied" && scenario !== "stale",
    decisions:
      exportStatus === "pending"
        ? []
        : [
            {
              id: "synthetic-export-decision",
              actorId: "synthetic-human",
              decision:
                exportStatus === "applied"
                  ? "approve"
                  : exportStatus === "rejected"
                    ? "reject"
                    : "withdraw",
              note: null,
              applicationCommitId: "synthetic-export-decision-commit",
              createdAt: fixedAt,
            },
          ],
    payload: {
      reviewId: ids.review,
      documentId: ids.document,
      versionId: ids.source,
      documentCommitId: "synthetic-source-commit",
      reviewCommitId: "synthetic-review-commit",
      requestFingerprint: "b".repeat(64),
      output: "clean",
      documentCount: 1,
      providerCostMicros: 0,
    },
  };
}
function proposalFixtures(): ApprovalProposal[] {
  const base = proposalFixture();
  const common = {
    matterId: base.matterId,
    revision: base.revision,
    proposalCommitId: base.proposalCommitId,
    contentHash: base.contentHash,
    policyRevision: base.policyRevision,
    requiredRole: base.requiredRole,
    proposerId: base.proposerId,
    agentLabel: "Synthetic agent",
    status: "pending" as const,
    lastCommitId: base.lastCommitId,
    createdAt: base.createdAt,
    policyChanged: false,
    stale: scenario === "stale",
    mayDecide: scenario !== "viewer",
    decisions: [],
  };
  const cellProposals = [1, 2].map(
    (index): ApprovalProposal => ({
      ...common,
      id: `60000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      status:
        decided.get(`60000000-0000-4000-8000-${String(index).padStart(12, "0")}`) ?? "pending",
      kind: "cell",
      artifactId: ids.review,
      payload: {
        reviewId: ids.review,
        documentId: ids.document,
        columnIndex: index,
        content: {
          summary: manifest.findings[index]!.summary,
          flag: "red",
          reasoning: manifest.findings[index]!.reasoning,
        },
        beforeContent: null,
        citations: [{ quote: manifest.findings[index]!.quote! }],
        baseCellCommitId: null,
        sourceVersionId: ids.source,
        sourceHash: "c".repeat(64),
        columnHash: "d".repeat(64),
      },
    })
  );
  const fields = {
    title: "Synthetic NDA workflow",
    type: "assistant" as const,
    promptMd: "Review the synthetic NDA against the captured firm positions.",
    steps: null,
    columnsConfig: null,
    rules: null,
    status: "approved" as const,
    practice: "General",
  };
  return [
    base,
    ...cellProposals,
    {
      ...common,
      id: "70000000-0000-4000-8000-000000000001",
      status: decided.get("70000000-0000-4000-8000-000000000001") ?? "pending",
      kind: "workflow",
      artifactId: "synthetic-workflow",
      payload: {
        action: "update",
        workflowId: "synthetic-workflow",
        tenantId: "synthetic-firm",
        before: { ...fields, promptMd: "Older synthetic instructions." },
        after: fields,
        baseContentHash: "e".repeat(64),
      },
    },
  ];
}
function documentFixture() {
  return {
    document: {
      id: ids.document,
      title: "Synthetic mutual NDA.docx",
      fileType: "docx",
      markdown: sourceText,
      status: "ready",
      headCommitId: `synthetic-document-${documentDecision}`,
      currentVersionId: ids.source,
      approvedVersionId: documentDecision === "pending" ? null : ids.source,
      approvedMarkdown: documentDecision === "pending" ? null : sourceText,
      sizeBytes: 12000,
      pageCount: 1,
      createdAt: fixedAt,
      ownerName: "Synthetic reviewer",
      ownerEmail: null,
    },
    edits: [
      {
        id: "synthetic-edit",
        changeId: "synthetic-change",
        deletedText: manifest.redlines[0]!.find,
        insertedText: manifest.redlines[0]!.replace,
        reason: "Synthetic exact approved standard",
        status: documentDecision,
        blame: cellFixtures()[1]!.blame,
      },
    ],
    resolutionPolicy: {
      approvalContext: [{ matterId: ids.matter, policyRevision: 2, requiredRole: "owner" }],
      mayResolve: scenario !== "viewer",
      mayPropose: scenario !== "viewer",
      requiredRole: "owner",
      blockedReason:
        scenario === "viewer" ? "A current human matter owner must decide these changes." : null,
    },
  };
}
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    location.href
  );
  if (url.origin !== location.origin)
    return new Response("Synthetic fixture blocks remote requests.", { status: 403 });
  if (!url.pathname.startsWith("/api/")) return nativeFetch(input, init);
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  const path = url.pathname;
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  if (scenario === "viewer" && method !== "GET" && !path.endsWith("/read"))
    return json({ error: "Synthetic viewer cannot mutate legal work." }, 403);
  if (path === "/api/auth/get-session") return json(null);
  if (scenario === "viewer" && path.startsWith("/api/admin"))
    return json({ error: "Synthetic viewer has no admin authority." }, 403);
  if (path === "/api/admin/job-controls") {
    if (init?.method === "PATCH") {
      controlPolicy = body.policy;
      controlsRevision++;
    }
    return json({
      revision: controlsRevision,
      configured: controlPolicy,
      effective: controlPolicy,
      scope: "durable_review",
      usage: {
        knownTokens: 1200,
        heldTokens: 2000,
        knownEstimatedUsd: 0.01,
        heldEstimatedUsd: 0.02,
        unpricedAttempts: 0,
      },
      capacity: { queued: 0, running: 0, failed: scenario === "failed" ? 1 : 0 },
    });
  }
  if (path === "/api/admin/job-controls/usage")
    return json([
      {
        day: "2026-10-13",
        matterId: ids.matter,
        actorId: "synthetic-human",
        actorType: "agent",
        agentLabel: "Synthetic reviewer",
        provider: "openai",
        model: "synthetic-model",
        attempts: 1,
        knownTokens: 1200,
        heldTokens: 2000,
        knownEstimatedUsd: 0.01,
        heldEstimatedUsd: 0.02,
        unpricedAttempts: 0,
      },
    ]);
  if (
    (path.includes("/edits/") && path.endsWith("resolve")) ||
    path.endsWith("resolve-all") ||
    path.endsWith("resolve-batch")
  ) {
    documentDecision = body.decision === "accept" ? "accepted" : "rejected";
    proposed = false;
    return json(documentFixture());
  }
  if (path === `/api/documents/${ids.document}`) return json(documentFixture());
  if (path.endsWith("/history")) return json([]);
  if (path.endsWith("/download") || path.includes("/versions/")) return nativeFetch(docxUrl);
  if (path.endsWith("/report"))
    return url.searchParams.get("format") === "json"
      ? json({
          fixture: true,
          notice: "Synthetic report fixture; no legal or output quality proof",
          manifest: { reviewId: ids.review, reviewedVersionId: ids.source, capturedAt: fixedAt },
          documents: completionFixture().documents,
        })
      : new Response(
          "# Synthetic review report\n\nFictional API fixture. Not authenticated, legal quality, provider or Word export proof.\n\n" +
            sourceText,
          { headers: { "Content-Type": "text/markdown" } }
        );
  if (path.endsWith("/opened")) return new Response(null, { status: 204 });
  if (path.endsWith("/disposition")) {
    disposition = body.status;
    rationale = body.rationale;
    return json({ ok: true });
  }
  if (path.endsWith("/redline")) {
    proposed = true;
    return json({ changeIds: ["synthetic-change"] });
  }
  if (path.endsWith("/queue")) {
    if (scenario === "failed" && !body.acknowledgeUnknown)
      return json({ error: "Acknowledge the uncertain provider outcome before retrying." }, 409);
    scenario = "partial";
    return json({ jobIds: [ids.job] }, 202);
  }
  if (path.endsWith("/clean-export-requests")) {
    const replayed = exportRequestId === body.requestId;
    if (!replayed) {
      exportRequestId = body.requestId;
      exportStatus = "pending";
    }
    return json({ approvalRequired: true, proposal: proposalFixture(), replayed });
  }
  if (path.endsWith("/read")) {
    eventRead = true;
    return json({ ok: true });
  }
  if (path.endsWith("/decisions") || path.endsWith("/decision")) {
    for (const input of body.decisions ?? [body]) {
      if (input.proposalId === ids.proposal)
        exportStatus =
          input.decision === "approve"
            ? "applied"
            : input.decision === "reject"
              ? "rejected"
              : "withdrawn";
      else decided.set(input.proposalId, input.decision === "approve" ? "applied" : "rejected");
    }
    return json({ outcome: body.decision === "reject" ? "rejected" : "applied" });
  }
  if (path.startsWith("/api/proposals/"))
    return json(
      proposalFixtures().find((proposal) => proposal.id === path.split("/").at(-1)) ?? null
    );
  if (path.endsWith("/approval-policy"))
    return json({
      policy: {
        agentCells: "owner",
        documentEdits: "owner",
        agentWorkflows: "owner",
        cleanExports: {
          approvalAboveDocuments: 0,
          approvalAboveProviderCostMicros: 0,
          requiredRole: "owner",
        },
      },
      revision: 2,
    });
  if (path.endsWith("/proposals"))
    return json({
      items: proposalFixtures().filter(
        (proposal) => proposal.status === (url.searchParams.get("status") ?? "pending")
      ),
      nextCursor: null,
    });
  if (path.endsWith("/job-events"))
    return json({
      events: [{ id: ids.job, job: jobFixture(), createdAt: fixedAt, read: eventRead }],
      nextCursor: null,
    });
  if (path === `/api/matters/${ids.matter}/jobs`)
    return json({
      jobs: [jobFixture()],
      counts: {
        queued: 0,
        running: 0,
        failed: scenario === "failed" ? 1 : 0,
        succeeded: scenario === "failed" ? 0 : 1,
        cancelled: 0,
      },
      truncated: false,
      spend: {
        knownTokens: 1200,
        heldTokens: scenario === "failed" ? 2000 : 0,
        knownEstimatedUsd: 0.01,
        heldEstimatedUsd: scenario === "failed" ? 0.02 : 0,
        unpricedAttempts: 0,
      },
    });
  if (path.endsWith("/jobs")) return json([jobFixture()]);
  if (path.endsWith("/usage"))
    return json({
      llm: [],
      tools: [],
      totals: { llmCalls: 4, inputTokens: 3200, outputTokens: 600, costUsd: 0.01, toolCalls: 0 },
    });
  if (path.endsWith("/completion")) return json(completionFixture());
  if (path === "/api/tabular/reviews")
    return json([
      {
        id: ids.review,
        title: "Synthetic NDA review",
        matterId: ids.matter,
        documentIds: [ids.document],
        createdAt: fixedAt,
      },
    ]);
  if (path === `/api/tabular/reviews/${ids.review}`)
    return json({
      review: {
        id: ids.review,
        title: "Synthetic NDA review",
        columnsConfig: manifest.rules.map((rule, index) => ({
          index,
          name: rule.clauseType,
          prompt: "Synthetic prompt",
        })),
        documentIds: [ids.document],
        headCommitId: "synthetic-review-commit",
      },
      cells: cellFixtures(),
      documentTitles: { [ids.document]: "Synthetic mutual NDA.docx" },
      documentMatters: { [ids.document]: "Synthetic matter" },
    });
  return json(
    { error: `Fixture does not implement ${path}; no application request was sent.` },
    404
  );
};

// Download anchors remain inside this deterministic fixture; no real /api request escapes.
document.addEventListener("click", (event) => {
  const anchor = (event.target as Element).closest("a[href]") as HTMLAnchorElement | null;
  if (!anchor) return;
  const url = new URL(anchor.href, location.href);
  if (!url.pathname.startsWith("/api/")) return;
  event.preventDefault();
  void window.fetch(url).then(async (response) => {
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const download = document.createElement("a");
    download.href = objectUrl;
    download.download = url.pathname.endsWith("report")
      ? "synthetic-review-report.md"
      : "fixed-synthetic-source.docx";
    download.click();
    URL.revokeObjectURL(objectUrl);
  });
});

function ReviewFixture() {
  const qc = useQueryClient();
  const completion = useQuery({
    queryKey: ["review-completion", ids.review],
    queryFn: () => api.getReviewCompletion(ids.review),
  });
  const review = useQuery({
    queryKey: ["review", ids.review],
    queryFn: () => api.getReview(ids.review),
  });
  const retry = useMutation({
    mutationFn: (acknowledgeUnknown: boolean) =>
      api.queueFailedReviewRules(ids.review, crypto.randomUUID(), undefined, acknowledgeUnknown),
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });
  return completion.data && review.data ? (
    <>
      <ContractReviewCompletion completion={completion.data} />
      <ContractReviewWorkspace
        completion={completion.data}
        cells={review.data.cells}
        onOpenDraft={() =>
          alert(
            "Synthetic fixture: use the standalone document workspace in the authenticated app to inspect Word and resolve tracked changes."
          )
        }
        onRetry={(ack) => retry.mutate(ack)}
        retrying={retry.isPending}
      />
    </>
  ) : (
    <p>Loading synthetic review…</p>
  );
}
function FixtureRoot() {
  const [surface, setSurface] = useState("review");
  const location = useRouterState({ select: (state) => state.location });
  useEffect(() => {
    if (location.pathname.startsWith("/documents/")) setSurface("document");
    else if ((location.search as { tab?: string }).tab === "activity") setSurface("approvals");
    else if (location.pathname.startsWith("/reviews/")) setSurface("review");
  }, [location.pathname, location.search]);
  const [selectedScenario, setSelectedScenario] = useState<Scenario>(scenario);
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-8">
          <p role="status" className="text-sm text-muted-foreground">
            Synthetic UI fixture — actual production components, fictional API data. No
            authenticated session, provider or release proof.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="mr-auto font-serif text-2xl">NDA review workspace</h1>
            <label className="text-sm">
              Scenario{" "}
              <select
                className="h-9 rounded-md border border-input bg-card px-2"
                value={selectedScenario}
                onChange={(event) => {
                  scenario = event.target.value as Scenario;
                  setSelectedScenario(scenario);
                  disposition = null;
                  proposed = false;
                  rationale = "";
                  exportStatus = "pending";
                  exportRequestId = undefined;
                  decided.clear();
                  documentDecision = "pending";
                  void queryClient.resetQueries();
                }}
              >
                <option value="partial">Partial findings</option>
                <option value="failed">Uncertain failed rule</option>
                <option value="invalid">Invalid quotation</option>
                <option value="stale">Stale source</option>
                <option value="complete">Completed decisions</option>
                <option value="viewer">Read-only viewer</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            {["review", "overview", "approvals", "document", "controls"].map((id) => (
              <Button
                key={id}
                variant={surface === id ? "secondary" : "ghost"}
                onClick={() => {
                  setSurface(id);
                  void router.navigate({
                    to: id === "document" ? "/documents/$id" : "/",
                    params: id === "document" ? { id: ids.document } : {},
                  });
                }}
              >
                {id === "review"
                  ? "Contract review"
                  : id === "overview"
                    ? "Matter overview"
                    : id === "approvals"
                      ? "Approval queue"
                      : id === "document"
                        ? "Document decisions"
                        : "Review limits"}
              </Button>
            ))}
          </div>
          {surface === "review" ? (
            <ReviewFixture />
          ) : surface === "overview" ? (
            <MatterOverview
              matterId={ids.matter}
              canEdit
              onOpenApprovals={() => setSurface("approvals")}
              onOpenUsage={() => alert("Synthetic recorded usage is shown below.")}
              onOpenDocuments={() =>
                alert("Synthetic source documents are shown in the review fixture.")
              }
            />
          ) : surface === "approvals" ? (
            <AgentActivity matterId={ids.matter} isOwner={scenario !== "viewer"} />
          ) : surface === "controls" ? (
            <JobControls />
          ) : null}
          <Outlet />
          <Toaster />
        </main>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
const rootRoute = createRootRoute({ component: FixtureRoot });
const authFixtureRoute = createRoute({ getParentRoute: () => rootRoute, id: "_auth" });
// Isolated router mounts the production view; its auth session API is explicitly null.
// No production route, middleware, database or credential path runs here.
ProductionDocumentRoute.update({
  id: "/documents/$id",
  path: "/documents/$id",
  getParentRoute: () => authFixtureRoute,
} as never);
const documentFixtureRoute: AnyRoute = ProductionDocumentRoute;
const routes = [
  createRoute({ getParentRoute: () => rootRoute, path: "/" }),
  createRoute({ getParentRoute: () => rootRoute, path: "/reviews/$id" }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/matters/$id",
    validateSearch: (input: Record<string, unknown>) => ({
      tab: input.tab === "activity" ? "activity" : undefined,
    }),
  }),
  authFixtureRoute.addChildren([documentFixtureRoute]),
];
const router = createRouter({
  routeTree: rootRoute.addChildren(routes),
  history: createMemoryHistory({ initialEntries: ["/"] }),
});
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
