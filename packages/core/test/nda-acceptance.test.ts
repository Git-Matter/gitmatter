import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { db, sql } from "@workspace/db/client";
import { tenants, user } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import fixture from "./fixtures/nda/manifest.json";
import { createClient, createMatter } from "../src/platform/matters.js";
import { createWorkflow, updateWorkflow } from "../src/platform/workflow.js";
import { createClause } from "../src/content/clauses.js";
import { runPlaybook } from "../src/ai/tabular/playbook.js";
import { writeCell } from "../src/ai/tabular/runner.js";
import {
  activeStoragePath,
  listVersions,
  downloadDocumentBytes,
  getDocument,
  processDocument,
  proposeEditDetail,
  resolveEdits,
  uploadDocument,
} from "../src/content/documents.js";
import {
  extractDocxBodyText,
  extractTrackedChangeIds,
} from "../src/content/docx/trackedChanges.js";
import { deleteObject, getObject } from "../src/core/storage.js";
import { listCommits } from "../src/core/commit.js";
import { auditTrailToCsv, gatherMatterAudit } from "../src/content/auditExport.js";
import { setFunnelSink } from "../src/core/funnel.js";
import type { FunnelEventName, FunnelProperties } from "@workspace/contracts";

const userId = `nda-acceptance-${randomUUID()}`;
let tenantId: string;
let matterId: string;
let documentId: string;
const human = { type: "user" as const, userId };
const agent = { type: "agent" as const, userId, agentLabel: "mcp:synthetic-nda" };
const events: Array<{ event: FunnelEventName; properties: FunnelProperties }> = [];

// This is deliberately an integration test, not a mocked model-quality claim.
describe("synthetic NDA baseline", () => {
  beforeAll(async () => {
    const [tenant] = await db
      .insert(tenants)
      .values({ name: "Synthetic NDA acceptance", storageRegion: "legacy" })
      .returning();
    tenantId = tenant!.id;
    await db.insert(user).values({
      id: userId,
      name: "Synthetic reviewer",
      email: `${userId}@example.com`,
      emailVerified: true,
      tenantId,
    });
    const client = await createClient(userId, tenantId, { name: "Synthetic Alpha" });
    matterId = (await createMatter(userId, { clientId: client.id, name: fixture.title })).id;
    setFunnelSink((event, properties) => events.push({ event, properties }));
  });
  afterAll(async () => {
    setFunnelSink(null);
    // Remove stored versions too, not only the database fixture.
    if (documentId) {
      for (const version of await listVersions(documentId)) {
        if (version.storagePath) await deleteObject(tenantId, version.storagePath);
      }
    }
    if (tenantId) await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db.delete(user).where(eq(user.id, userId));
    await sql.end();
  });

  test("upload → cited playbook fixture → tracked redline → human decision → export and audit", async () => {
    const source = readFileSync(new URL("./fixtures/nda/source.docx", import.meta.url));
    const doc = await uploadDocument(userId, {
      title: fixture.title,
      fileType: "docx",
      bytes: source,
      matterId,
    });
    documentId = doc!.id;
    await processDocument(doc!);
    expect((await getDocument(documentId))?.status).toBe("ready");
    const standardId = await createClause(human, {
      title: "Synthetic term standard",
      body: fixture.redlines[0]!.replace,
      category: "confidentiality",
      status: "approved",
    });
    const fallbackId = await createClause(human, {
      title: "Synthetic term fallback",
      body: fixture.redlines[0]!.fallback!,
      category: "confidentiality",
      parentClauseId: standardId,
      fallbackRank: 1,
      status: "approved",
    });
    const rules = fixture.rules.map((rule) => ({
      ...rule,
      severity: "red" as const,
      ...(rule.id === "term"
        ? { standardClauseId: standardId, fallbacks: [{ clauseId: fallbackId }] }
        : {}),
    }));
    const playbookId = await createWorkflow(human, {
      title: "Synthetic NDA policy",
      type: "playbook",
      promptMd: "Synthetic acceptance only",
      rules,
    });
    await updateWorkflow(human, playbookId, { status: "approved" });
    const { reviewId } = await runPlaybook(agent, {
      playbookId,
      documentIds: [documentId],
      matterId,
    });
    const extracted = await extractDocxBodyText(source);
    for (const [columnIndex, finding] of fixture.findings.entries()) {
      if (finding.quote) expect(extracted).toContain(finding.quote);
      await writeCell(agent, {
        reviewId,
        documentId,
        columnIndex,
        summary: finding.summary,
        flag: finding.flag,
        reasoning: finding.reasoning,
        citations: finding.quote ? [{ quote: finding.quote }] : [],
      });
    }
    const proposed = await proposeEditDetail(
      agent,
      documentId,
      fixture.redlines.map((edit) => ({
        find: edit.find,
        replace: edit.replace,
        reason: `Synthetic policy ${edit.ruleId}`,
      }))
    );
    expect(proposed.failed).toBe(0);
    expect(proposed.applied).toBe(fixture.redlines.length);
    const pending = (await getDocument(documentId))!;
    const path = await activeStoragePath(pending);
    expect(path).toBeTruthy();
    const beforePreview = events.filter((entry) => entry.event === "document_exported").length;
    await downloadDocumentBytes(pending, path!, human, true);
    expect(events.filter((entry) => entry.event === "document_exported")).toHaveLength(
      beforePreview
    );
    const bytes = Buffer.from(await downloadDocumentBytes(pending, path!, human));
    expect(await extractTrackedChangeIds(bytes)).toHaveLength(fixture.redlines.length * 2);
    await expect(resolveEdits(agent, documentId, proposed.changeIds, "accept")).rejects.toThrow(
      "A person must"
    );
    await resolveEdits(human, documentId, proposed.changeIds, "accept");
    const accepted = (await getDocument(documentId))!;
    const acceptedBytes = Buffer.from(
      await getObject(tenantId, (await activeStoragePath(accepted))!)
    );
    const text = await extractDocxBodyText(acceptedBytes);
    for (const redline of fixture.redlines) {
      expect(text).toContain(redline.replace);
      expect(text).not.toContain(redline.find);
    }
    const trail = (await gatherMatterAudit(matterId))!;
    for (const op of fixture.expectedAuditOps)
      expect(trail.entries.some((entry) => entry.op === op)).toBe(true);
    expect(trail.entries.some((entry) => entry.actor === agent.agentLabel)).toBe(true);
    expect(
      trail.entries.some((entry) => entry.actorType === "user" && entry.op === "resolve_edit")
    ).toBe(true);
    expect(auditTrailToCsv(trail)).toContain(agent.agentLabel);
    expect((await listCommits("document", documentId)).length).toBeGreaterThanOrEqual(3);
    for (const name of [
      "upload_started",
      "extraction_ready",
      "playbook_started",
      "playbook_completed",
      "redline_proposed",
      "redline_resolved",
      "document_exported",
    ])
      expect(events.some((entry) => entry.event === name)).toBe(true);
    expect(JSON.stringify(events)).not.toContain(fixture.paragraphs[0]);
  }, 30_000);

  test("nonmatching edit reports failure without changing document head", async () => {
    const before = await getDocument(documentId);
    await expect(
      proposeEditDetail(agent, documentId, [
        { find: "TEXT ABSENT FROM FIXTURE", replace: "replacement" },
      ])
    ).rejects.toThrow("Could not locate");
    expect((await getDocument(documentId))?.headCommitId).toBe(before?.headCommitId);
    expect(
      events.some(
        (entry) => entry.event === "redline_failed" && entry.properties.outcome === "failed"
      )
    ).toBe(true);
  });
});
