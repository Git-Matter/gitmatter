import { and, eq, inArray, max } from "drizzle-orm";
import { db } from "@workspace/db/client";
import { commits, documentEdits, tabularCells, tabularReviews } from "@workspace/db/schema";
import type { Actor } from "../core/commit.js";
import { canAccessArtifact, canReadDocument } from "../core/access.js";
import { getReviewCompletion } from "../ai/tabular/contract-review.js";

/** A read-only snapshot. Its manifest describes this report, not future DOCX downloads. */
export async function captureReviewReport(actor: Actor, reviewId: string) {
  return db.transaction(
    async (tx) => {
      if (!(await canAccessArtifact(actor, "tabular_review", reviewId, "viewer", tx)))
        throw new Error("access_denied");
      const completion = await getReviewCompletion(actor, reviewId, tx);
      if (!completion) throw new Error("input_not_ready");
      for (const document of completion.documents)
        if (!(await canReadDocument(actor, document.documentId, tx)))
          throw new Error("access_denied");
      const [review] = await tx
        .select()
        .from(tabularReviews)
        .where(eq(tabularReviews.id, reviewId));
      if (!review?.inputSnapshot) throw new Error("input_not_ready");
      const cells = await tx.select().from(tabularCells).where(eq(tabularCells.reviewId, reviewId));
      const edits = review.documentIds.length
        ? await tx
            .select()
            .from(documentEdits)
            .where(inArray(documentEdits.documentId, review.documentIds))
        : [];
      const commitIds = [
        ...new Set([
          ...cells.flatMap((cell) =>
            [cell.finding?.revisionId, cell.disposition?.commitId, cell.lastCommitId].filter(
              (id): id is string => !!id
            )
          ),
          ...edits
            .filter((edit) => edit.findingProvenance?.reviewId === reviewId)
            .flatMap((edit) => (edit.lastCommitId ? [edit.lastCommitId] : [])),
        ]),
      ];
      const provenance = commitIds.length
        ? await tx
            .select({
              id: commits.id,
              actorType: commits.actorType,
              actorId: commits.actorId,
              agentLabel: commits.agentLabel,
              op: commits.op,
              message: commits.message,
              createdAt: commits.createdAt,
            })
            .from(commits)
            .where(inArray(commits.id, commitIds))
        : [];
      const documentCutoffs = review.documentIds.length
        ? await tx
            .select({ artifactId: commits.artifactId, seq: max(commits.seq) })
            .from(commits)
            .where(
              and(
                eq(commits.artifactType, "document"),
                inArray(commits.artifactId, review.documentIds)
              )
            )
            .groupBy(commits.artifactId)
        : [];
      const capturedAt = new Date().toISOString();
      return {
        title: review.title,
        manifest: {
          schemaVersion: 1 as const,
          output: "review_report" as const,
          capturedAt,
          exportedBy: {
            actorType: actor.type,
            userId: actor.userId,
            agentLabel: actor.type === "agent" ? actor.agentLabel : null,
          },
          reviewId,
          reviewCommitId: review.headCommitId,
          playbookId: review.inputSnapshot.playbookId,
          playbookRevision: review.inputSnapshot.playbookRevision,
          inputSnapshotRevision: review.inputSnapshot.revision,
          reviewInstructions:
            review.inputSnapshot.revision === 2 ? review.inputSnapshot.reviewInstructions : null,
          policyRevision: completion.policyRevision,
          cleanReadyAtCapture: completion.cleanReady,
          decisionsCompleteAtCapture: completion.decisionsComplete,
          documents: completion.documents.map((doc) => ({
            documentId: doc.documentId,
            title: doc.title,
            reviewedVersionId: doc.reviewedVersionId,
            currentVersionId: doc.currentVersionId,
            approvedVersionId: doc.approvedVersionId,
            approvedBaselineReady: doc.approvedBaselineReady,
            documentCommitId: doc.currentHeadCommitId,
            auditCutoffSequence: Math.max(
              0,
              ...documentCutoffs
                .filter((commit) => commit.artifactId === doc.documentId)
                .map((commit) => Number(commit.seq))
            ),
            sourceChanged: doc.sourceChanged,
            wordInspection: doc.wordInspection,
            cleanReadyAtCapture: doc.cleanReady,
          })),
        },
        documents: completion.documents.map((doc) => ({
          ...doc,
          findings: doc.findings.map((finding) => {
            const cell = cells.find(
              (item) =>
                item.documentId === doc.documentId && item.columnIndex === finding.columnIndex
            );
            return {
              ...finding,
              execution: cell?.status ?? "pending",
              content: cell?.content ?? null,
              citations: cell?.citations ?? [],
              decision: cell?.disposition ?? null,
              edits: edits
                .filter(
                  (edit) =>
                    edit.documentId === doc.documentId &&
                    edit.findingProvenance?.reviewId === reviewId &&
                    edit.findingProvenance.columnIndex === finding.columnIndex
                )
                .map((edit) => ({
                  id: edit.id,
                  status: edit.status,
                  commitId: edit.lastCommitId,
                  provenance: edit.findingProvenance,
                })),
            };
          }),
        })),
        provenance,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}

export type ReviewReport = Awaited<ReturnType<typeof captureReviewReport>>;
const text = (value: string) => value.replace(/[\\`*_{}[\]<>()#+.!|~-]/g, "\\$&");

export function renderReviewReportMarkdown(report: ReviewReport) {
  const lines = [
    `# Review report: ${text(report.title)}`,
    "",
    `Captured ${text(report.manifest.capturedAt)}. ${report.manifest.cleanReadyAtCapture ? "The captured state met clean export readiness." : "Clean export was not ready at capture; findings, decisions, source or Word inspection may need attention."}`,
    "This report does not approve legal quality, resolve tracked changes, or certify a later document export. Quotations and approved language refer to captured review inputs. Review the attached manifest for exact version and commit references.",
    "",
    `Playbook ${text(report.manifest.playbookId)} · revision ${text(report.manifest.playbookRevision)}`,
    "",
    "## Captured review instructions",
    ...(report.manifest.reviewInstructions
      ? [
          `Represented party: ${text(report.manifest.reviewInstructions.representedParty ?? "Unknown")}`,
          `Disclosure role: ${report.manifest.reviewInstructions.disclosureRole}`,
          `NDA structure: ${report.manifest.reviewInstructions.ndaStructure}`,
          `Business purpose: ${text(report.manifest.reviewInstructions.businessPurpose ?? "Unknown")}`,
          `Governing law: ${text(report.manifest.reviewInstructions.governingLaw ?? "Unknown")}`,
          ...(report.manifest.reviewInstructions.additionalInstructions
            ? [
                `Additional instructions: ${text(report.manifest.reviewInstructions.additionalInstructions)}`,
              ]
            : []),
        ]
      : [
          "No review instructions were captured. Represented party, disclosure role, NDA structure, business purpose and governing law are unknown.",
        ]),
  ];
  for (const document of report.documents) {
    lines.push(
      "",
      `## ${text(document.title)}`,
      `Reviewed version: ${text(document.reviewedVersionId ?? "captured text")}. Current version: ${text(document.currentVersionId ?? "unavailable")}.`,
      `Open findings: ${document.unresolved}. Unfinished rules: ${document.unfinished}. Pending edits: ${document.pendingEdits}. Pending approvals: ${document.pendingApprovals}.`,
      ...(document.sourceChanged
        ? ["Source changed outside this review; new proposals require a new review."]
        : [])
    );
    for (const finding of document.findings) {
      lines.push(
        "",
        `### ${text(finding.name)}`,
        `Risk: ${finding.severity === "red" ? "high" : "negotiable"}. Execution: ${finding.execution}. Outcome: ${finding.finding?.outcome ?? "unavailable"}. Disposition: ${finding.disposition}.`,
        `Standard position: ${text(finding.standardPosition)}`
      );
      if (finding.content)
        lines.push("", text(finding.content.summary), "", text(finding.content.reasoning));
      if (finding.finding?.outcome === "not_found")
        lines.push(
          "No matching provision was found in the captured source; no supporting quotation exists."
        );
      for (const citation of finding.citations)
        lines.push(
          "",
          `> ${text(citation.quote).replaceAll("\n", "\n> ")}`,
          ...(citation.page ? [`Recorded source page: ${citation.page}.`] : [])
        );
      if (finding.rationale) lines.push("", `Human rationale: ${text(finding.rationale)}`);
      if (finding.decision)
        lines.push(
          `Decision actor: ${text(finding.decision.actorId)}. Decision commit: ${text(finding.decision.commitId)}.`
        );
      if (finding.finding)
        lines.push(
          `Finding revision: ${text(finding.finding.revisionId)}. Citation validation: ${finding.finding.citationsValid ? "passed" : "inconclusive"}.`
        );
      for (const clause of finding.clauses)
        lines.push(
          "",
          `Approved clause: ${text(clause.title)} · ${text(clause.id)} · revision ${text(clause.revision)}`,
          text(clause.body)
        );
      for (const edit of finding.edits)
        lines.push(
          `Tracked edit ${text(edit.id)}: ${edit.status}. Clause revision ${text(edit.provenance?.clauseRevision ?? "unavailable")}. Commit ${text(edit.commitId ?? "unavailable")}.`
        );
    }
  }
  lines.push("", "## Commit provenance");
  for (const commit of report.provenance)
    lines.push(
      `- ${text(commit.id)} · ${commit.actorType} ${text(commit.agentLabel ?? commit.actorId ?? "unavailable")} · ${text(commit.op)} · ${text(commit.createdAt.toISOString())} · ${text(commit.message)}`
    );
  lines.push(
    "",
    "## Report manifest",
    "",
    "```json",
    JSON.stringify(report.manifest, null, 2),
    "```",
    ""
  );
  return lines.join("\n");
}
