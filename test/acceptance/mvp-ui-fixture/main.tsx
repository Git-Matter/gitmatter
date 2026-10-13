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
import { FirstReviewGuide } from "@/components/FirstReviewGuide";
import { WordInspectionNotice } from "@/routes/_auth/documents/-components/WordInspectionNotice";
import { Toaster } from "@/components/ui/sonner";
import { Route as ProductionDocumentRoute } from "@/routes/_auth/documents/$id";
import { Route as ProductionReviewRoute } from "@/routes/_auth/reviews/$id";
import { api, type Cell, type ReviewCompletion } from "@/lib/data/api";
import {
  reviewInstructionsSchema,
  type ApprovalProposal,
  type JobSnapshot,
  type DocumentWordInspection,
  type FirstReviewStatus,
  type ReviewInstructions,
} from "@workspace/contracts";
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
  playbook: "10000000-0000-4000-8000-000000000007",
};
const originalReviewId = ids.review;
const fixedAt = "2026-10-14T02:00:00.000Z";
type Scenario =
  | "partial"
  | "failed"
  | "invalid"
  | "stale"
  | "complete"
  | "viewer"
  | "legacy"
  | "unknown_context"
  | "word_incoming"
  | "word_limited"
  | "word_unknown"
  | "document_pending"
  | "guide_start"
  | "guide_no_provider"
  | "guide_no_standard"
  | "guide_no_source";
let scenario: Scenario = "partial";
const findingDecisions = new Map<
  number,
  { status: "left_unchanged" | "escalated"; rationale: string }
>();
const proposedFindings = new Map<number, { find: string; replace: string }>();
const resolvedFindings = new Map<number, "accepted" | "rejected">();
let eventRead = false;
let exportStatus: "pending" | "applied" | "rejected" | "withdrawn" = "pending";
let exportRequestId: string | undefined;
const decided = new Map<string, "applied" | "rejected">();
let documentDecision: "pending" | "accepted" | "rejected" = "accepted";
let preparedReview = false;
let savedInstructions: ReviewInstructions | undefined;
let preparationRequests = 0;
const preparedReceipts = new Map<string, { fingerprint: string; reviewId: string }>();
const requestCounters = { catalogs: 0, estimates: 0, executionAttempts: 0 };
function countRequest(kind: keyof typeof requestCounters) {
  requestCounters[kind]++;
  window.dispatchEvent(new Event("synthetic-request-count"));
}
const unknownInstructions: ReviewInstructions = {
  representedParty: null,
  disclosureRole: "unknown",
  ndaStructure: "unknown",
  businessPurpose: null,
  governingLaw: null,
};
const exampleInstructions: ReviewInstructions = {
  representedParty: "Fictional Recipient Ltd",
  disclosureRole: "receiving",
  ndaStructure: "mutual",
  businessPurpose: "Evaluate a fictional collaboration",
  governingLaw: null,
  additionalInstructions: "Identify restrictions on disclosure to advisers.",
};

function instructionsFixture(): ReviewInstructions | null {
  if (savedInstructions) return savedInstructions;
  if (scenario === "legacy") return null;
  return scenario === "unknown_context" ? unknownInstructions : exampleInstructions;
}

function wordFixture(pending = 0): DocumentWordInspection {
  const incoming = scenario === "word_incoming";
  const limited = scenario === "word_limited";
  const unknown = scenario === "word_unknown";
  const blocked = incoming || limited || unknown;
  return {
    versionId:
      scenario === "stale" || proposedFindings.size
        ? "50000000-0000-4000-8000-000000000001"
        : ids.source,
    inspection: {
      schemaVersion: 1,
      sourceHash: "f".repeat(64),
      status: unknown ? "uninspectable" : "complete",
      textView: limited || unknown ? "limited_body" : "accepted_body",
      stories: {
        body: 1,
        headers: limited ? 1 : 0,
        footers: 0,
        footnotes: 0,
        endnotes: 0,
        comments: 0,
        other: 0,
      },
      revisions: {
        insertions: incoming ? 1 : pending,
        deletions: incoming ? 1 : pending,
        moves: 0,
        formatting: limited ? 1 : 0,
        other: 0,
      },
      reasons: unknown
        ? ["storage_unavailable"]
        : limited
          ? ["non_body_revision", "unsupported_revision"]
          : [],
    },
    registeredRevisions: blocked ? 0 : pending * 2,
    incomingRevisions: incoming ? 2 : limited ? 1 : 0,
    safeToEdit: !blocked,
    safeClean: !blocked && pending === 0,
  };
}

function firstReviewFixture(matterId: string | null): FirstReviewStatus {
  const completion = completionFixture();
  const prepared = preparedReview || !scenario.startsWith("guide_");
  const canEdit = scenario !== "viewer";
  const hasMatter = matterId === ids.matter;
  return {
    capturedAt: fixedAt,
    organization: {
      name: "Fictional acceptance firm",
      storageRegion: "au",
      canPublishFirmStandard: canEdit,
    },
    matters: [{ id: ids.matter, name: "Fictional NDA matter", canEdit }],
    mattersTruncated: false,
    matter: hasMatter ? { id: ids.matter, name: "Fictional NDA matter", canEdit } : null,
    application: {
      verification: "configuration_only",
      providers: [
        {
          provider: "anthropic",
          label: "Anthropic (synthetic configuration)",
          available: scenario !== "guide_no_provider",
          source: scenario === "guide_no_provider" ? null : "user",
          models: [
            {
              id: "claude-sonnet-5",
              label: "Claude Sonnet 5 (fixture choice only)",
              provider: "anthropic",
              capabilities: { vision: true, tools: true, reasoning: true, contextWindow: 200000 },
            },
          ],
        },
      ],
    },
    agent: {
      connections:
        scenario === "guide_no_provider"
          ? []
          : [{ label: "Fictional MCP client", kind: "oauth", lastUsedAt: null }],
      recentlyUsed: false,
    },
    playbooks:
      hasMatter && scenario !== "guide_no_standard"
        ? [
            {
              id: ids.playbook,
              title: "Fictional firm-approved NDA positions",
              ruleCount: manifest.rules.length,
            },
          ]
        : [],
    playbooksTruncated: false,
    documents: hasMatter
      ? [
          {
            id: ids.document,
            title: "Synthetic mutual NDA.docx",
            fileType: "docx",
            status: scenario === "guide_no_source" ? "processing" : "ready",
            ready: scenario !== "guide_no_source",
            uploaded: true,
          },
        ]
      : [],
    documentsTruncated: false,
    documentsSearchIncomplete: false,
    reviewSearchIncomplete: false,
    review:
      hasMatter && prepared
        ? {
            id: ids.review,
            title: "Synthetic NDA review",
            instructionsCaptured: instructionsFixture() !== null,
            totalFindings: manifest.rules.length,
            completedFindings: preparationRequests
              ? 0
              : scenario === "failed"
                ? manifest.rules.length - 1
                : manifest.rules.length,
            failedFindings: scenario === "failed" ? 1 : 0,
            unresolvedFindings: completion.documents[0]!.unresolved,
            pendingEdits: completion.documents[0]!.pendingEdits,
            pendingApprovals: 0,
            sourceChanged: scenario === "stale",
            decisionsComplete: completion.decisionsComplete,
            cleanReady: completion.cleanReady,
          }
        : null,
  };
}
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
      preparationRequests > 0 || (scenario === "failed" && index === 2)
        ? null
        : {
            summary: finding.summary,
            flag: finding.flag as "green" | "red",
            reasoning: finding.reasoning,
          },
    citations:
      preparationRequests > 0
        ? []
        : finding.quote
          ? [
              {
                quote:
                  scenario === "invalid" && index === 1
                    ? "A quotation not present in this source."
                    : finding.quote,
              },
            ]
          : [],
    status:
      preparationRequests > 0 ? "pending" : scenario === "failed" && index === 2 ? "error" : "done",
    lastCommitId: preparationRequests > 0 ? null : `finding-${index}`,
    blame:
      preparationRequests > 0
        ? null
        : {
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
  const pendingEdits =
    (documentDecision === "pending" ? 1 : 0) +
    [...proposedFindings.keys()].filter((index) => !resolvedFindings.has(index)).length;
  const wordInspection = wordFixture(pendingEdits);
  const findings = manifest.rules.map((rule, index) => ({
    columnIndex: index,
    cellId: cells[index]!.id,
    ruleId: rule.id,
    name: rule.clauseType,
    severity: rule.severity as "red",
    standardPosition: rule.standardPosition,
    finding:
      preparationRequests > 0 || (scenario === "failed" && index === 2)
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
    disposition: findingDisposition(index),
    rationale:
      findingDecisions.get(index)?.rationale ??
      (scenario === "complete" ? "Synthetic human acceptance rationale." : null),
    addressed:
      findingDisposition(index) !== "escalated" &&
      (findingDisposition(index) === "resolved" ||
        findingDisposition(index) === "left_unchanged" ||
        (index === 0 && !proposedFindings.has(index))),
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
    inputSnapshotRevision: instructionsFixture() ? 2 : 1,
    reviewInstructions: instructionsFixture(),
    matterId: ids.matter,
    reviewCommitId: "synthetic-review-commit",
    playbookId: ids.playbook,
    playbookRevision: "synthetic-playbook-approved-v1",
    capturedAt: fixedAt,
    cleanReady:
      scenario !== "stale" &&
      scenario !== "failed" &&
      findings.every((finding) => finding.addressed) &&
      pendingEdits === 0 &&
      wordInspection.safeClean &&
      preparationRequests === 0,
    decisionsComplete:
      scenario !== "stale" &&
      scenario !== "failed" &&
      findings.every((finding) => finding.addressed) &&
      pendingEdits === 0 &&
      preparationRequests === 0,
    documents: [
      {
        canPropose: scenario !== "viewer" && wordInspection.safeToEdit && preparationRequests === 0,
        wordInspection,
        fileType: "docx",
        reviewedText: sourceText,
        documentId: ids.document,
        title: "Synthetic mutual NDA.docx",
        editableDocx: wordInspection.safeToEdit,
        reviewedVersionId: ids.source,
        currentVersionId:
          scenario === "stale" || proposedFindings.size > 0
            ? "50000000-0000-4000-8000-000000000001"
            : ids.source,
        approvedVersionId:
          proposedFindings.size > 0 && pendingEdits === 0
            ? "50000000-0000-4000-8000-000000000001"
            : ids.source,
        approvedBaselineReady: scenario !== "stale" && pendingEdits === 0,
        currentHeadCommitId: "synthetic-source-commit",
        sourceChanged: scenario === "stale",
        unfinished: preparationRequests > 0 ? manifest.rules.length : scenario === "failed" ? 1 : 0,
        unresolved: findings.filter((finding) => !finding.addressed).length,
        pendingEdits,
        pendingApprovals: 0,
        findings,
        cleanReady:
          scenario !== "stale" &&
          scenario !== "failed" &&
          findings.every((finding) => finding.addressed) &&
          pendingEdits === 0 &&
          wordInspection.safeClean &&
          preparationRequests === 0,
        decisionsComplete:
          scenario !== "stale" &&
          scenario !== "failed" &&
          findings.every((finding) => finding.addressed) &&
          pendingEdits === 0 &&
          preparationRequests === 0,
      },
    ],
  };
}
function findingDisposition(index: number) {
  const decision = findingDecisions.get(index);
  if (decision?.status === "escalated") return "escalated";
  if (proposedFindings.has(index) && !resolvedFindings.has(index)) return "redline_proposed";
  if (resolvedFindings.get(index) === "accepted") return "resolved";
  if (decision?.status === "left_unchanged") return "left_unchanged";
  return scenario === "complete" || scenario.startsWith("word_")
    ? "left_unchanged"
    : "needs_attention";
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
  const snapshot = completionFixture().documents[0]!;
  const inspection = snapshot.wordInspection ?? wordFixture(snapshot.pendingEdits);
  return {
    wordInspection: inspection,
    document: {
      id: ids.document,
      matterId: ids.matter,
      title: "Synthetic mutual NDA.docx",
      fileType: "docx",
      markdown: sourceText,
      status: "ready",
      headCommitId: `synthetic-document-${documentDecision}`,
      currentVersionId: snapshot.currentVersionId,
      approvedVersionId:
        proposedFindings.size > 0
          ? snapshot.approvedVersionId
          : documentDecision === "pending"
            ? null
            : ids.source,
      approvedMarkdown:
        proposedFindings.size > 0
          ? snapshot.approvedBaselineReady
            ? sourceText
            : null
          : documentDecision === "pending"
            ? null
            : sourceText,
      sizeBytes: 12000,
      pageCount: 1,
      createdAt: fixedAt,
      ownerName: "Synthetic reviewer",
      ownerEmail: null,
    },
    edits: scenario.startsWith("word_")
      ? []
      : proposedFindings.size > 0
        ? [...proposedFindings].map(([columnIndex, edit]) => ({
            id: `synthetic-edit-${columnIndex}`,
            changeId: `synthetic-change-${columnIndex}`,
            deletedText: edit.find,
            insertedText: edit.replace,
            reason: "Synthetic exact approved standard",
            status: resolvedFindings.get(columnIndex) ?? "pending",
            blame: cellFixtures()[columnIndex]!.blame,
          }))
        : [
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
      mayResolve: scenario !== "viewer" && inspection.safeToEdit,
      mayPropose: scenario !== "viewer" && inspection.safeToEdit,
      requiredRole: "owner",
      blockedReason:
        scenario === "viewer"
          ? "A current human matter owner must decide these changes."
          : !inspection.safeToEdit
            ? "Resolve incoming or unsupported revisions in Word, then upload a new source."
            : null,
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
  if (path === "/api/models" && method === "GET") {
    countRequest("catalogs");
    return json(firstReviewFixture(ids.matter).application.providers);
  }
  if (path === "/api/models/openrouter" && method === "GET") return json([]);
  if (path === `/api/tabular/reviews/${ids.review}/estimate` && method === "GET") {
    countRequest("estimates");
    const model = url.searchParams.get("model");
    const available = firstReviewFixture(ids.matter).application.providers.some(
      (provider) =>
        provider.available && provider.models.some((candidate) => candidate.id === model)
    );
    if (!available) return json({ error: "Fixture preferred model is unavailable." }, 409);
    return json({
      model,
      cells: manifest.rules.length,
      inputTokenUpperEstimate: 12000,
      outputTokenLimit: 8192,
      costUsd: 0.08,
      budgetWindowMinutes: 1440,
      tokenLimits: { tenant: 500000, user: 100000, matter: 100000, token: 50000, run: 30000 },
      tenantCostLimitUsd: 20,
      costLimitScope: "application_llm",
    });
  }
  if (
    method === "POST" &&
    (path === `/api/tabular/reviews/${ids.review}/run` ||
      path === `/api/tabular/reviews/${ids.review}/run-all`)
  ) {
    countRequest("executionAttempts");
    return json(
      { error: "Synthetic fixture blocks model execution. No provider call was made." },
      501
    );
  }
  if (path === "/api/first-review" && method === "GET") {
    const matterId = url.searchParams.get("matterId");
    if (matterId && matterId !== ids.matter) return json({ error: "Unknown fixture matter." }, 403);
    return json(firstReviewFixture(matterId));
  }
  if (
    path === "/api/documents" &&
    url.searchParams.get("matterId") === ids.matter &&
    method === "GET"
  )
    return json(
      firstReviewFixture(ids.matter).documents.map((doc) => ({
        ...doc,
        matterId: ids.matter,
        sizeBytes: 12000,
        createdAt: fixedAt,
        currentVersionId: ids.source,
        approvedVersionId: ids.source,
        ocrSuggested: false,
        extractionError: null,
        folderId: null,
      }))
    );
  if (path === `/api/workflows/${ids.playbook}/run-playbook` && method === "POST") {
    const context = reviewInstructionsSchema.safeParse(body.reviewInstructions);
    if (
      !context.success ||
      body.matterId !== ids.matter ||
      body.documentIds?.length !== 1 ||
      body.documentIds[0] !== ids.document ||
      !body.requestId
    )
      return json(
        {
          error:
            "Fixture requires exact source, matter, request ID and bounded review instructions.",
        },
        400
      );
    const readiness = firstReviewFixture(ids.matter);
    if (!readiness.playbooks.length || !readiness.documents[0]?.ready)
      return json({ error: "Fixture review inputs are not ready." }, 409);
    const fingerprint = JSON.stringify({
      matterId: body.matterId,
      documentIds: body.documentIds,
      reviewInstructions: context.data,
    });
    const prior = preparedReceipts.get(body.requestId);
    if (prior && prior.fingerprint !== fingerprint) return json({ error: "request_conflict" }, 409);
    if (prior) return json({ reviewId: prior.reviewId, ruleCount: manifest.rules.length });
    if (!prior) {
      ids.review = crypto.randomUUID();
      savedInstructions = context.data;
      preparedReview = true;
      preparationRequests++;
      preparedReceipts.set(body.requestId, { fingerprint, reviewId: ids.review });
      findingDecisions.clear();
      proposedFindings.clear();
      resolvedFindings.clear();
      documentDecision = "accepted";
    }
    return json({ reviewId: ids.review, ruleCount: manifest.rules.length });
  }
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
      scope: "application_llm",
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
        day: "2026-10-14",
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
    const changeId = path.split("/").at(-2);
    const requested = path.endsWith("resolve-batch")
      ? (body.changeIds as string[])
      : path.endsWith("resolve-all")
        ? [...proposedFindings.keys()].map((index) => `synthetic-change-${index}`)
        : [changeId];
    for (const index of proposedFindings.keys()) {
      if (!requested.includes(`synthetic-change-${index}`)) continue;
      resolvedFindings.set(index, documentDecision);
      if (
        documentDecision === "rejected" &&
        findingDecisions.get(index)?.status === "left_unchanged"
      )
        findingDecisions.delete(index);
    }
    return json(documentFixture());
  }
  if (path === `/api/documents/${ids.document}`) return json(documentFixture());
  if (path === `/api/documents/${ids.document}/versions` && method === "GET")
    return json([
      {
        id: completionFixture().documents[0]!.currentVersionId,
        versionNumber: 1,
        sizeBytes: 12000,
        fileType: "docx",
        source: "upload",
        deletedAt: null,
        createdAt: fixedAt,
      },
    ]);
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
    if (
      !Number.isInteger(body.columnIndex) ||
      !manifest.rules[body.columnIndex] ||
      !["left_unchanged", "escalated"].includes(body.status)
    )
      return json({ error: "Invalid fixture finding decision" }, 400);
    findingDecisions.set(body.columnIndex, { status: body.status, rationale: body.rationale });
    return json({ ok: true });
  }
  if (path.endsWith("/redline")) {
    if (!completionFixture().documents[0]!.canPropose)
      return json({ error: "Fixture Word safety or permissions block this proposal." }, 409);
    const finding = completionFixture().documents[0]!.findings.find(
      (item) => item.columnIndex === body.columnIndex
    );
    const clause = finding?.clauses.find((item) => item.id === body.clauseId);
    if (!finding || !clause) return json({ error: "Invalid fixture finding or clause" }, 400);
    proposedFindings.set(body.columnIndex, { find: body.find, replace: clause.body });
    resolvedFindings.delete(body.columnIndex);
    return json({ changeIds: [`synthetic-change-${body.columnIndex}`] });
  }
  if (path.endsWith("/queue")) {
    countRequest("executionAttempts");
    if (scenario === "failed" && !body.acknowledgeUnknown)
      return json({ error: "Acknowledge the uncertain provider outcome before retrying." }, 409);
    scenario = "partial";
    return json({ jobIds: [ids.job] }, 202);
  }
  if (path.endsWith("/clean-export-requests")) {
    if (!completionFixture().cleanReady)
      return json({ error: "Fixture clean output is not ready." }, 409);
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
  if (path.endsWith("/jobs")) return json(preparationRequests > 0 ? [] : [jobFixture()]);
  if (path.endsWith("/usage"))
    return json({
      llm: [],
      tools: [],
      totals: { llmCalls: 4, inputTokens: 3200, outputTokens: 600, costUsd: 0.01, toolCalls: 0 },
    });
  if (path.endsWith("/completion")) return json(completionFixture());
  if (path === "/api/tabular/reviews")
    return json(
      scenario.startsWith("guide_") && !preparedReview
        ? []
        : [
            {
              id: ids.review,
              title: "Synthetic NDA review",
              matterId: ids.matter,
              documentIds: [ids.document],
              createdAt: fixedAt,
            },
          ]
    );
  if (path === `/api/tabular/reviews/${ids.review}`)
    return json({
      review: {
        id: ids.review,
        matterId: ids.matter,
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
  const search = useRouterState({
    select: (state) => state.location.search as { executionRoute?: string; model?: string },
  });
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
      {preparedReview && (
        <p role="status" className="text-sm text-muted-foreground">
          Synthetic saved preparation: {preparationRequests} request(s). Captured route:{" "}
          {search.executionRoute ?? "choose on review"}; preferred model:{" "}
          {search.model ?? "choose on review"}. Findings are pending. No model was called.
        </p>
      )}
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

function GuideFixture() {
  const matterId = useRouterState({
    select: (state) => (state.location.search as { matterId?: string }).matterId,
  });
  return (
    <FirstReviewGuide
      matterId={matterId}
      onChooseMatter={(id) =>
        void router.navigate({ to: "/first-review", search: { matterId: id || undefined } })
      }
    />
  );
}
function FixtureRoot() {
  const [surface, setSurface] = useState("review");
  const location = useRouterState({ select: (state) => state.location });
  useEffect(() => {
    if (location.pathname.startsWith("/documents/")) setSurface("document");
    else if (location.pathname === "/first-review") setSurface("guide");
    else if ((location.search as { tab?: string }).tab === "activity") setSurface("approvals");
    else if (location.pathname.startsWith("/reviews/")) setSurface("review");
  }, [location.pathname, location.search]);
  const [selectedScenario, setSelectedScenario] = useState<Scenario>(scenario);
  const [counts, setCounts] = useState({ ...requestCounters });
  useEffect(() => {
    const refresh = () => setCounts({ ...requestCounters });
    window.addEventListener("synthetic-request-count", refresh);
    refresh();
    return () => window.removeEventListener("synthetic-request-count", refresh);
  }, []);
  const productionReviewMounted = location.pathname.startsWith("/reviews/");
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-8">
          <p role="status" className="text-sm text-muted-foreground">
            Synthetic UI fixture — actual production components, fictional API data. No
            authenticated session, provider or release proof.
          </p>
          <p
            data-testid="synthetic-request-counters"
            role="status"
            className="text-xs text-muted-foreground"
          >
            Synthetic API requests: model catalogs {counts.catalogs}, estimates {counts.estimates},
            execution attempts {counts.executionAttempts}. Actual provider calls: 0. Execution is
            blocked by this fixture.
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
                  findingDecisions.clear();
                  proposedFindings.clear();
                  resolvedFindings.clear();
                  exportStatus = "pending";
                  exportRequestId = undefined;
                  decided.clear();
                  documentDecision = scenario === "document_pending" ? "pending" : "accepted";
                  preparedReview = false;
                  savedInstructions = undefined;
                  preparationRequests = 0;
                  preparedReceipts.clear();
                  ids.review = originalReviewId;
                  requestCounters.catalogs = 0;
                  requestCounters.estimates = 0;
                  requestCounters.executionAttempts = 0;
                  window.dispatchEvent(new Event("synthetic-request-count"));
                  void queryClient.resetQueries();
                  if (productionReviewMounted)
                    void router.navigate({
                      to: "/reviews/$id",
                      params: { id: ids.review },
                      search: location.search,
                    });
                }}
              >
                <option value="partial">Partial findings</option>
                <option value="failed">Uncertain failed rule</option>
                <option value="invalid">Invalid quotation</option>
                <option value="stale">Stale source</option>
                <option value="complete">Completed decisions</option>
                <option value="viewer">Read-only viewer</option>
                <option value="legacy">Legacy review — instructions unknown</option>
                <option value="unknown_context">Captured explicit unknown instructions</option>
                <option value="word_incoming">Incoming Word revisions</option>
                <option value="word_limited">Unsupported non-body Word revision</option>
                <option value="word_unknown">Word inspection unavailable</option>
                <option value="document_pending">Recorded pending document proposal</option>
                <option value="guide_start">First review — ready to prepare</option>
                <option value="guide_no_provider">First review — no AI route configured</option>
                <option value="guide_no_standard">First review — no approved standard</option>
                <option value="guide_no_source">First review — source still preparing</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            {["guide", "review", "overview", "approvals", "document", "word", "controls"].map(
              (id) => (
                <Button
                  key={id}
                  variant={surface === id ? "secondary" : "ghost"}
                  onClick={() => {
                    setSurface(id);
                    void router.navigate({
                      to:
                        id === "document"
                          ? "/documents/$id"
                          : id === "guide"
                            ? "/first-review"
                            : id === "review"
                              ? "/reviews/$id"
                              : "/",
                      params:
                        id === "document"
                          ? { id: ids.document }
                          : id === "review"
                            ? { id: ids.review }
                            : {},
                      search: id === "guide" ? { matterId: ids.matter } : {},
                    });
                  }}
                >
                  {id === "guide"
                    ? "Guided first review"
                    : id === "word"
                      ? "Word inspection"
                      : id === "review"
                        ? "Contract review"
                        : id === "overview"
                          ? "Matter overview"
                          : id === "approvals"
                            ? "Approval queue"
                            : id === "document"
                              ? "Document decisions"
                              : "Review limits"}
                </Button>
              )
            )}
          </div>
          {surface === "guide" ? (
            <GuideFixture />
          ) : surface === "word" ? (
            <WordInspectionNotice inspection={completionFixture().documents[0]!.wordInspection} />
          ) : surface === "review" && !productionReviewMounted ? (
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
ProductionReviewRoute.update({
  id: "/reviews/$id",
  path: "/reviews/$id",
  getParentRoute: () => authFixtureRoute,
} as never);
const productionReviewFixtureRoute: AnyRoute = ProductionReviewRoute;
const routes = [
  createRoute({ getParentRoute: () => rootRoute, path: "/" }),
  createRoute({ getParentRoute: () => rootRoute, path: "/first-review" }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/matters/$id",
    validateSearch: (input: Record<string, unknown>) => ({
      tab: input.tab === "activity" ? "activity" : undefined,
    }),
  }),
  authFixtureRoute.addChildren([documentFixtureRoute, productionReviewFixtureRoute]),
];
const router = createRouter({
  routeTree: rootRoute.addChildren(routes),
  history: createMemoryHistory({
    initialEntries: [window.location.pathname + window.location.search],
  }),
});
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
