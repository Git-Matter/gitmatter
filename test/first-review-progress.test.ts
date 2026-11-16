import { describe, expect, test } from "vite-plus/test";
import type { FirstReviewStatus } from "../packages/contracts/src/first-review";
import {
  recommendFirstReviewTask,
  reviewFindingStatus,
} from "../apps/web/src/design-system/first-review-progress";

function facts(): FirstReviewStatus {
  return {
    capturedAt: "2026-11-12T00:00:00Z",
    organization: { name: "Fictional firm", storageRegion: "au", canPublishFirmStandard: true },
    matters: [],
    mattersTruncated: false,
    matter: { id: "matter", name: "Fictional matter", canEdit: true },
    application: { providers: [], verification: "configuration_only" },
    agent: { connections: [], recentlyUsed: false },
    playbooks: [{ id: "standard", title: "Approved NDA", ruleCount: 3 }],
    playbooksTruncated: false,
    documents: [
      {
        id: "doc",
        title: "NDA.docx",
        fileType: "docx",
        status: "ready",
        ready: true,
        uploaded: true,
      },
    ],
    documentsTruncated: false,
    documentsSearchIncomplete: false,
    reviewSearchIncomplete: false,
    review: null,
  };
}
function review(): NonNullable<FirstReviewStatus["review"]> {
  return {
    id: "review",
    title: "NDA review",
    instructionsCaptured: true,
    totalFindings: 3,
    completedFindings: 3,
    failedFindings: 0,
    unresolvedFindings: 1,
    pendingEdits: 0,
    pendingApprovals: 0,
    sourceChanged: false,
    decisionsComplete: false,
    cleanReady: false,
  };
}

describe("first-review presentation recommendation", () => {
  test("does not manufacture a next task before a matter or for an unprepared reader", () => {
    const status = facts();
    status.matter = null;
    expect(recommendFirstReviewTask(status, true)).toBeNull();
    status.matter = { id: "matter", name: "Read only", canEdit: false };
    expect(recommendFirstReviewTask(status, true)).toBeNull();
    status.review = review();
    expect(recommendFirstReviewTask(status, false)).toBe(6);
    status.review.sourceChanged = true;
    expect(recommendFirstReviewTask(status, false)).toBe(6);
  });
  test("orders actual prerequisites and treats local route selection only as preparation readiness", () => {
    const status = facts();
    status.organization.storageRegion = null;
    expect(recommendFirstReviewTask(status, true)).toBe(1);
    status.organization.storageRegion = "au";
    expect(recommendFirstReviewTask(status, false)).toBe(2);
    status.playbooks = [];
    expect(recommendFirstReviewTask(status, true)).toBe(3);
    status.playbooks = facts().playbooks;
    status.documents[0].ready = false;
    expect(recommendFirstReviewTask(status, true)).toBe(4);
    status.documents[0].ready = true;
    status.documents[0].uploaded = false;
    expect(recommendFirstReviewTask(status, true)).toBe(4);
    status.documents = facts().documents;
    expect(recommendFirstReviewTask(status, true)).toBe(5);
    expect(status.review).toBeNull();
  });
  test("resumes existing valid work without requiring a fresh provider choice", () => {
    const status = facts();
    status.review = review();
    status.playbooks = [];
    status.documents = [];
    status.organization.storageRegion = null;
    expect(recommendFirstReviewTask(status, false)).toBe(7);
    status.review.decisionsComplete = true;
    expect(recommendFirstReviewTask(status, false)).toBe(8);
    expect(status.review.cleanReady).toBe(false); // The UI recommendation never grants export readiness.
  });
  test("keeps incomplete, failed and zero-result runs at evidence inspection", () => {
    const status = facts();
    status.review = review();
    status.review.completedFindings = 2;
    expect(recommendFirstReviewTask(status, false)).toBe(6);
    status.review.completedFindings = 3;
    status.review.failedFindings = 1;
    expect(recommendFirstReviewTask(status, false)).toBe(6);
    status.review.failedFindings = 0;
    status.review.totalFindings = 0;
    status.review.completedFindings = 0;
    expect(recommendFirstReviewTask(status, false)).toBe(6);
  });
  test("never presents stale or uncaptured context as a resumable legal decision", () => {
    const status = facts();
    status.review = review();
    status.review.sourceChanged = true;
    expect(recommendFirstReviewTask(status, true)).toBe(5);
    expect(recommendFirstReviewTask(status, false)).toBe(2);
    status.review.sourceChanged = false;
    status.review.instructionsCaptured = false;
    expect(recommendFirstReviewTask(status, true)).toBe(5);
  });
});

describe("truthful review preparation labels", () => {
  test("does not infer ongoing work or success from an incomplete or failed record", () => {
    expect(reviewFindingStatus(null)).toBe("Needs review");
    const current = review();
    expect(reviewFindingStatus(current)).toBe("Findings prepared");
    current.completedFindings = 0;
    expect(reviewFindingStatus(current)).toBe("Findings incomplete");
    current.failedFindings = 1;
    expect(reviewFindingStatus(current)).toBe("Findings need attention");
    current.sourceChanged = true;
    expect(reviewFindingStatus(current)).toBe("Earlier source");
  });
});
