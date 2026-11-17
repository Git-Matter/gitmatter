import { afterAll, beforeAll, expect, test, vi } from "vite-plus/test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, sql } from "@workspace/db/client";
import {
  hiddenWorkflows,
  matterDocuments,
  matterMembers,
  mcpAccessTokens,
  tenants,
  tabularReviews,
  user,
  userApiKeys,
} from "@workspace/db/schema";
import { getFirstReviewStatus } from "../src/core/first-review.js";
import { ensureDefaultMatter } from "../src/platform/matters.js";
import { createWorkflow } from "../src/platform/workflow.js";
import { createDocument } from "../src/content/documents.js";
import { runPlaybook } from "../src/ai/tabular/playbook.js";
import { createReview } from "../src/ai/tabular/reviews.js";
import { writeCell } from "../src/ai/tabular/runner.js";
import { setFindingDisposition } from "../src/ai/tabular/contract-review.js";
import { getReview } from "../src/ai/tabular/queries.js";
import { recordCommit } from "../src/core/commit.js";
import { documents } from "@workspace/db/schema";

vi.mock("../src/ai/provider/keys.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/ai/provider/keys.js")>()),
  envProviderStatus: () => ({ anthropic: false, openai: false, gemini: false, openrouter: false }),
}));

const userId = `first-review-${randomUUID()}`;
const otherId = `first-review-other-${randomUUID()}`;
const outsiderId = `first-review-outside-${randomUUID()}`;
const actor = { type: "user" as const, userId };
let tenantId: string;
let outsideTenantId: string;
let matterId: string;
let otherMatter: string;
let outsiderMatter: string;
let playbookId: string;
let documentId: string;

beforeAll(async () => {
  const [tenant] = await db
    .insert(tenants)
    .values({ name: "Guided review fixture", storageRegion: "au" })
    .returning();
  const [outside] = await db
    .insert(tenants)
    .values({ name: "Outside guide fixture", storageRegion: "eu" })
    .returning();
  tenantId = tenant!.id;
  outsideTenantId = outside!.id;
  await db.insert(user).values([
    {
      id: userId,
      name: "Guide reviewer",
      email: `${userId}@example.com`,
      tenantId,
      tenantRole: "admin",
      emailVerified: true,
    },
    {
      id: otherId,
      name: "Private reviewer",
      email: `${otherId}@example.com`,
      tenantId,
      tenantRole: "member",
      emailVerified: true,
    },
    {
      id: outsiderId,
      name: "Outside reviewer",
      email: `${outsiderId}@example.com`,
      tenantId: outsideTenantId,
      tenantRole: "admin",
      emailVerified: true,
    },
  ]);
  matterId = await ensureDefaultMatter(userId, "Guide reviewer", tenantId);
  otherMatter = await ensureDefaultMatter(otherId, "Private reviewer", tenantId);
  outsiderMatter = await ensureDefaultMatter(outsiderId, "Outside reviewer", outsideTenantId);
  const standard = {
    type: "playbook" as const,
    promptMd: "",
    rules: [
      {
        id: randomUUID(),
        clauseType: "Confidentiality",
        standardPosition: "Keep information confidential",
        severity: "yellow" as const,
      },
    ],
  };
  playbookId = await createWorkflow(actor, {
    ...standard,
    title: "Approved guide positions",
    status: "approved",
  });
  await createWorkflow(actor, {
    ...standard,
    title: "Unapproved starter positions",
    status: "draft",
  });
  const hiddenId = await createWorkflow(actor, {
    ...standard,
    title: "Hidden approved positions",
    status: "approved",
  });
  await db.insert(hiddenWorkflows).values({ userId, workflowId: hiddenId });
  documentId = (
    await createDocument(userId, {
      title: "Actual pasted NDA",
      markdown: "Keep information confidential.",
      matterId,
    })
  ).id;
  // Intentionally invalid encrypted fixture data proves status never resolves a key value.
  await db.insert(userApiKeys).values({
    userId,
    provider: "openai",
    encrypted: "invalid-fixture",
    iv: "invalid-fixture",
    authTag: "invalid-fixture",
  });
  await db.insert(mcpAccessTokens).values([
    {
      userId,
      tokenHash: `fixture-${randomUUID()}`,
      label: "Permitted recently used client",
      allowedMatterIds: [matterId],
      maxRole: "editor",
      lastUsedAt: new Date(),
    },
    {
      userId,
      tokenHash: `fixture-${randomUUID()}`,
      label: "Never used client",
      allowedMatterIds: [matterId],
      maxRole: "editor",
    },
    {
      userId,
      tokenHash: `fixture-${randomUUID()}`,
      label: "Other matter client",
      allowedMatterIds: [otherMatter],
      lastUsedAt: new Date(),
    },
    {
      userId,
      tokenHash: `fixture-${randomUUID()}`,
      label: "Read only client",
      allowedMatterIds: [matterId],
      maxRole: "viewer",
      lastUsedAt: new Date(),
    },
    {
      userId,
      tokenHash: `fixture-${randomUUID()}`,
      label: "Revoked client",
      revokedAt: new Date(),
      lastUsedAt: new Date(),
    },
  ]);
});

afterAll(async () => {
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await db.delete(tenants).where(eq(tenants.id, outsideTenantId));
  for (const id of [userId, otherId, outsiderId]) await db.delete(user).where(eq(user.id, id));
  await sql.end();
});

test("first review has explicit matter selection, configuration-only readiness and human approval", async () => {
  const selection = await getFirstReviewStatus(actor);
  expect(selection.matter).toBeNull();
  expect(selection.review).toBeNull();
  expect(selection.matters.map((matter) => matter.id)).toEqual([matterId]);
  expect(selection.organization).toMatchObject({
    storageRegion: "au",
    canPublishFirmStandard: true,
  });
  const status = await getFirstReviewStatus(actor, { matterId });
  expect(status.application).toMatchObject({
    verification: "configuration_only",
    providers: expect.arrayContaining([
      expect.objectContaining({ provider: "openai", source: "user", available: true }),
    ]),
  });
  expect(status.playbooks.map((playbook) => playbook.title)).toEqual(["Approved guide positions"]);
  expect(status.documents[0]).toMatchObject({
    title: "Actual pasted NDA",
    ready: true,
    uploaded: false,
  });
  expect(status.agent.connections.map((connection) => connection.label)).toEqual(
    expect.arrayContaining(["Permitted recently used client", "Never used client"])
  );
  expect(status.agent.connections).toHaveLength(2);
  expect(status.agent.recentlyUsed).toBe(true);
  expect(JSON.stringify(status)).not.toContain("invalid-fixture");
});

test("guide rechecks tenant, matter membership and scoped role instead of granting setup privileges", async () => {
  await expect(getFirstReviewStatus(actor, { matterId: otherMatter })).rejects.toThrow(
    "access_denied"
  );
  await expect(getFirstReviewStatus(actor, { matterId: outsiderMatter })).rejects.toThrow(
    "access_denied"
  );
  await db.insert(matterMembers).values({ matterId: outsiderMatter, userId, role: "owner" });
  await expect(getFirstReviewStatus(actor, { matterId: outsiderMatter })).rejects.toThrow(
    "access_denied"
  );
  const scoped = {
    type: "agent" as const,
    userId,
    agentLabel: "Scoped fixture",
    scope: { matterIds: [matterId], maxRole: "viewer" as const },
  };
  const status = await getFirstReviewStatus(scoped, { matterId });
  expect(status.matter?.canEdit).toBe(false);
  expect(status.organization.canPublishFirmStandard).toBe(false);
  expect(status.agent.connections).toEqual([]);
  const noMatters = await getFirstReviewStatus({
    ...scoped,
    scope: { matterIds: [], maxRole: "viewer" },
  });
  expect(noMatters.matters).toEqual([]);
});

test("saved instructions and current human decisions progress independently of clean Word readiness", async () => {
  const run = await runPlaybook(actor, {
    playbookId,
    documentIds: [documentId],
    matterId,
    reviewInstructions: {
      representedParty: null,
      disclosureRole: "unknown",
      ndaStructure: "unknown",
      businessPurpose: null,
      governingLaw: null,
    },
  });
  let status = await getFirstReviewStatus(actor, { matterId });
  expect(status.review).toMatchObject({
    id: run.reviewId,
    instructionsCaptured: true,
    totalFindings: 1,
    completedFindings: 0,
    decisionsComplete: false,
    cleanReady: false,
  });
  await writeCell(actor, {
    reviewId: run.reviewId,
    documentId,
    columnIndex: 0,
    summary: "Needs judgment",
    flag: "yellow",
    reasoning: "Synthetic fixture finding",
    citations: [{ quote: "Keep information confidential." }],
  });
  const cell = (await getReview(run.reviewId))!.cells[0]!;
  await setFindingDisposition(actor, run.reviewId, {
    documentId,
    columnIndex: 0,
    revisionId: cell.finding!.revisionId,
    status: "left_unchanged",
    rationale: "Fixture decision",
  });
  status = await getFirstReviewStatus(actor, { matterId });
  expect(status.review).toMatchObject({
    completedFindings: 1,
    unresolvedFindings: 0,
    decisionsComplete: true,
    cleanReady: false,
  });
  await recordCommit({
    artifactType: "document",
    artifactId: documentId,
    actor,
    op: "replace",
    message: "Replace fixture source after review",
    apply: async ({ tx }) => {
      await tx
        .update(documents)
        .set({ markdown: "New current source." })
        .where(eq(documents.id, documentId));
      return {
        changes: [
          {
            path: "field/markdown",
            before: "Keep information confidential.",
            after: "New current source.",
          },
        ],
      };
    },
  });
  expect((await getFirstReviewStatus(actor, { matterId })).review).toMatchObject({
    sourceChanged: true,
    decisionsComplete: false,
    cleanReady: false,
  });
});

test("private linked sources do not consume the readable limit and empty ad-hoc reviews do not replace contract progress", async () => {
  const previousReviewId = (await getFirstReviewStatus(actor, { matterId })).review!.id;
  const ids = Array.from({ length: 101 }, () => randomUUID());
  // Imported fixture rows represent private-origin sources linked into the matter.
  await db.insert(documents).values(
    ids.map((id) => ({
      id,
      userId: otherId,
      tenantId,
      matterId: otherMatter,
      title: "Private linked fixture source",
      fileType: "text",
      status: "ready" as const,
      markdown: "Private fixture text.",
      createdAt: new Date(Date.now() + 60000),
    }))
  );
  await db.insert(matterDocuments).values(ids.map((id) => ({ matterId, documentId: id })));
  const status = await getFirstReviewStatus(actor, { matterId });
  expect(status.documents.map((document) => document.id)).toEqual([documentId]);
  expect(status.documentsTruncated).toBe(false);
  expect(status.documentsSearchIncomplete).toBe(false);
  const [currentSource] = await db.select().from(documents).where(eq(documents.id, documentId));
  await createReview(actor, {
    title: "Ad-hoc review without contract rules",
    matterId,
    documentIds: [documentId],
    columnsConfig: [],
    inputSnapshot: {
      revision: 1,
      createdAt: new Date().toISOString(),
      playbookId,
      playbookRevision: "fixture",
      rules: [],
      documents: [
        {
          id: documentId,
          title: "Fixture",
          versionId: currentSource!.currentVersionId,
          headCommitId: currentSource!.headCommitId,
          text: currentSource!.markdown!,
        },
      ],
    },
  });
  expect((await getFirstReviewStatus(actor, { matterId })).review?.id).toBe(previousReviewId);
});

test("an inaccessible legacy snapshot does not hide an older readable review or expose its text", async () => {
  const readableReviewId = (await getFirstReviewStatus(actor, { matterId })).review!.id;
  const [previous] = await db
    .select()
    .from(tabularReviews)
    .where(eq(tabularReviews.id, readableReviewId));
  const privateSource = await createDocument(otherId, {
    title: "Private legacy source",
    matterId: otherMatter,
    markdown: "Private legacy source text must stay private.",
  });
  // A legacy/imported malformed snapshot is not reachable through the review's source-id list.
  // Seed it directly to exercise the defensive read guard, without creating a legal mutation path.
  await db.insert(tabularReviews).values({
    id: randomUUID(),
    userId: otherId,
    tenantId,
    matterId,
    title: "Legacy review with unavailable source",
    columnsConfig: previous!.columnsConfig,
    documentIds: [documentId],
    inputSnapshot: {
      ...previous!.inputSnapshot!,
      documents: [
        {
          id: privateSource.id,
          title: privateSource.title,
          text: privateSource.markdown!,
          headCommitId: privateSource.headCommitId,
          versionId: privateSource.currentVersionId,
        },
      ],
    },
    createdAt: new Date(Date.now() + 1000),
  });
  const status = await getFirstReviewStatus(actor, { matterId });
  expect(status.review?.id).toBe(readableReviewId);
  expect(status.reviewSearchIncomplete).toBe(false);
  expect(JSON.stringify(status)).not.toContain("Private legacy source");
});

test("revoked membership removes guide data even if an authorized connection remains", async () => {
  await db.delete(matterMembers).where(eq(matterMembers.userId, userId));
  await expect(getFirstReviewStatus(actor, { matterId })).rejects.toThrow("access_denied");
  expect((await getFirstReviewStatus(actor)).matters).toEqual([]);
});
