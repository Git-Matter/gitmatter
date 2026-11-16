import { expect, test } from "vite-plus/test";
import type { TemplateView } from "../packages/contracts/src/templates";
import { templateSnapshotAccess } from "../apps/web/src/routes/_auth/library/-components/template-access";

const source = {
  id: "working-v2",
  title: "Private working title",
  category: "Commercial",
  body: "Private working language",
  guidance: "Private guidance",
  audience: "workspace" as const,
  version: 2,
  createdBy: "owner",
  createdAt: "2026-11-17T00:00:00.000Z",
  file: null,
};
const opened: TemplateView = {
  id: "template",
  ownerId: "owner",
  ownerName: "Owner",
  headCommitId: "head-2",
  status: "review",
  canManage: true,
  canEdit: false,
  canReview: true,
  canPublish: true,
  canManageMembers: false,
  reviewerId: "reviewer",
  reviewerName: "Reviewer",
  reviewNote: null,
  members: [{ userId: "reviewer", name: "Reviewer", role: "reviewer" }],
  publishedAt: "2026-11-17T00:00:00.000Z",
  publishedBy: "owner",
  publishedByName: "Owner",
  draft: source,
  current: {
    ...source,
    id: "approved-v1",
    title: "Approved title",
    guidance: "Approved guidance",
    version: 1,
    body: "Approved language",
  },
};
const reader: TemplateView = {
  ...opened,
  status: "published",
  headCommitId: "approved-v1",
  canManage: false,
  canReview: false,
  canPublish: false,
  reviewerId: null,
  reviewerName: null,
  members: [],
  draft: null,
};

test("a successful redacted reader response revokes the private snapshot and every private control", () => {
  expect(templateSnapshotAccess(opened, reader)).toEqual({
    privateViewRevoked: true,
    canManage: false,
    canEdit: false,
    canReview: false,
    canPublish: false,
    canManageMembers: false,
  });
});

test("an authoritative summary revokes private display before full detail finishes loading", () => {
  expect(templateSnapshotAccess(opened, opened, reader).privateViewRevoked).toBe(true);
  expect(templateSnapshotAccess(opened, opened, reader).canReview).toBe(false);
});

test("an ordinary revision change leaves an authorized frozen source available", () => {
  const changed = { ...opened, headCommitId: "head-3", draft: { ...source, id: "working-v3" } };
  expect(templateSnapshotAccess(opened, changed).privateViewRevoked).toBe(false);
  expect(templateSnapshotAccess(opened, changed).canReview).toBe(true);
});

test("lost review authority does not remove still-authorized source access or grant new editing rights", () => {
  const editor = { ...opened, canEdit: true, canReview: false, canPublish: false };
  const access = templateSnapshotAccess(opened, editor);
  expect(access.privateViewRevoked).toBe(false);
  expect(access.canManage).toBe(true);
  expect(access.canReview).toBe(false);
  expect(access.canEdit).toBe(false);
});

test("ownership loss removes team administration even when delegated edit access remains", () => {
  const owner = { ...opened, canEdit: true, canManageMembers: true };
  const editor = { ...owner, canManageMembers: false, canReview: false, canPublish: false };
  expect(templateSnapshotAccess(owner, editor)).toMatchObject({
    privateViewRevoked: false,
    canManage: true,
    canEdit: true,
    canManageMembers: false,
  });
});

test("a removed working source is never kept visible merely because a capability flag remains true", () => {
  expect(templateSnapshotAccess(opened, { ...opened, draft: null }).privateViewRevoked).toBe(true);
});
