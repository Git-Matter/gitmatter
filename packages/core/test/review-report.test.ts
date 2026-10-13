import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { db, sql } from "@workspace/db/client";
import { documents, tabularReviews, tenants, user } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { createClient, createMatter } from "../src/platform/matters.js";
import { writeCell } from "../src/ai/tabular/runner.js";
import { captureReviewReport, renderReviewReportMarkdown } from "../src/content/reviewReport.js";

const userId = `report-review-${randomUUID()}`;
const human = { type: "user" as const, userId };
let tenantId: string, matterId: string, documentId: string, reviewId: string;
const versionId = randomUUID();
const source = "Recipient must protect <Confidential> [Information] for two years.";
const clauseId = randomUUID();

beforeAll(async () => {
  const [tenant] = await db.insert(tenants).values({ name: "Synthetic report" }).returning();
  tenantId = tenant!.id;
  await db.insert(user).values({
    id: userId,
    name: "Synthetic reviewer",
    email: `${userId}@example.com`,
    emailVerified: true,
    tenantId,
  });
  const client = await createClient(userId, tenantId, { name: "Synthetic client" });
  matterId = (await createMatter(userId, { clientId: client.id, name: "Synthetic matter" })).id;
  const [doc] = await db
    .insert(documents)
    .values({
      userId,
      tenantId,
      matterId,
      title: "Source NDA",
      fileType: "docx",
      status: "ready",
      markdown: source,
      currentVersionId: versionId,
      approvedVersionId: versionId,
      approvedMarkdown: source,
    })
    .returning();
  documentId = doc!.id;
  const [review] = await db
    .insert(tabularReviews)
    .values({
      userId,
      tenantId,
      matterId,
      createdBy: userId,
      title: "Synthetic NDA review",
      columnsConfig: [{ index: 0, name: "Confidentiality", prompt: "Check confidentiality" }],
      documentIds: [documentId],
      inputSnapshot: {
        revision: 1,
        createdAt: "2026-10-13T00:00:00.000Z",
        playbookId: randomUUID(),
        playbookRevision: "approved-playbook-v1",
        documents: [
          { id: documentId, title: doc!.title, versionId, headCommitId: null, text: source },
        ],
        rules: [
          {
            id: "confidentiality",
            columnIndex: 0,
            name: "Confidentiality",
            severity: "red",
            standardPosition: "Protect confidential information",
            clauses: [
              {
                id: clauseId,
                revision: "approved-clause-v1",
                title: "Firm standard",
                body: "Protect all Confidential Information for three years.",
              },
            ],
          },
        ],
      },
    })
    .returning();
  reviewId = review!.id;
});
afterAll(async () => {
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await db.delete(user).where(eq(user.id, userId));
  await sql.end();
});

describe("captured review report", () => {
  test("labels incomplete work without inventing findings or approvals", async () => {
    const report = await captureReviewReport(human, reviewId);
    expect(report.manifest.cleanReadyAtCapture).toBe(false);
    expect(report.documents[0]!.findings[0]!.finding).toBeNull();
    const markdown = renderReviewReportMarkdown(report);
    expect(markdown).toContain("Partial report");
    expect(markdown).toContain("Outcome: unavailable");
    expect(markdown).toContain("does not approve legal quality");
  });
  test("pins source, finding, approved clause and audit references before later changes", async () => {
    await writeCell(human, {
      reviewId,
      documentId,
      columnIndex: 0,
      summary: "Conforms",
      flag: "green",
      reasoning: "Synthetic fixture",
      citations: [{ quote: source }],
    });
    const report = await captureReviewReport(human, reviewId);
    expect(report.manifest.cleanReadyAtCapture).toBe(true);
    expect(report.manifest.reviewCommitId).toBeTruthy();
    expect(report.manifest.documents[0]!.reviewedVersionId).toBe(versionId);
    expect(report.manifest.documents[0]!.approvedVersionId).toBe(versionId);
    expect(report.documents[0]!.findings[0]!.citations).toEqual([{ quote: source }]);
    expect(report.documents[0]!.findings[0]!.clauses[0]!.revision).toBe("approved-clause-v1");
    expect(
      report.provenance.some(
        (commit) => commit.id === report.documents[0]!.findings[0]!.finding!.revisionId
      )
    ).toBe(true);
    await db
      .update(documents)
      .set({ markdown: "A different source", currentVersionId: randomUUID() })
      .where(eq(documents.id, documentId));
    expect(report.documents[0]!.reviewedText).toBe(source);
    expect(report.manifest.cleanReadyAtCapture).toBe(true);
    const changed = await captureReviewReport(human, reviewId);
    expect(changed.manifest.cleanReadyAtCapture).toBe(false);
    expect(changed.documents[0]!.sourceChanged).toBe(true);
    expect(changed.documents[0]!.findings[0]!.clauses[0]!.body).toBe(
      "Protect all Confidential Information for three years."
    );
    expect(renderReviewReportMarkdown(report)).toContain("\\<Confidential\\> \\[Information\\]");
  });
  test("rejects a scoped agent outside the matter before exporting confidential source", async () => {
    await expect(
      captureReviewReport(
        {
          type: "agent",
          userId,
          agentLabel: "mcp:outside",
          scope: { matterIds: [randomUUID()], maxRole: "owner" },
        },
        reviewId
      )
    ).rejects.toThrow("access_denied");
  });
});
