import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { db, type Tx } from "@workspace/db/client";
import { templates, templateMembers, templateRevisions, user } from "@workspace/db/schema";
import {
  templateActionSchema,
  templateContentSchema,
  templateSaveSchema,
  templateListQuerySchema,
  type TemplateContent,
  type TemplateView,
  type TemplateSummary,
  type TemplatePage,
} from "@workspace/contracts";
import type { z } from "zod";
import { type Actor, recordCommit, listCommits, getCommitChanges } from "../core/commit.js";
import { attachStagedObject, putStagedObject } from "../core/staged-objects.js";
import { buildStoragePath, getObject } from "../core/storage.js";
import { extractMarkdown } from "./extract.js";
import { inspectDocx } from "./docx/inspection.js";
import { generateDocx } from "./docx/generate.js";

type Reader = typeof db | Tx;
type RevisionRow = typeof templateRevisions.$inferSelect;
type Changes = Array<{ path: string; before: unknown; after: unknown }>;
export const MAX_TEMPLATE_FILE_BYTES = 20 * 1024 * 1024;

export class TemplateError extends Error {
  constructor(
    message: string,
    public status: 400 | 403 | 404 | 409 | 413 = 409
  ) {
    super(message);
  }
}

async function accountFor(actor: Actor, reader: Reader = db) {
  if (actor.type === "agent" && actor.scope?.matterIds)
    throw new TemplateError("This token cannot access the template library", 403);
  const [account] = await reader.select().from(user).where(eq(user.id, actor.userId));
  if (!account?.tenantId) throw new TemplateError("No workspace", 403);
  return account;
}
function writable(actor: Actor) {
  if (actor.type === "agent" && actor.scope?.maxRole === "viewer")
    throw new TemplateError("This token is read-only", 403);
}

async function contextFor(actor: Actor, id: string, reader: Reader = db) {
  const account = await accountFor(actor, reader);
  const [row] = await reader.select().from(templates).where(eq(templates.id, id));
  if (!row || row.tenantId !== account.tenantId) throw new TemplateError("Template not found", 404);
  const [member] = await reader
    .select()
    .from(templateMembers)
    .where(and(eq(templateMembers.templateId, id), eq(templateMembers.userId, actor.userId)));
  const owner = row.ownerId === actor.userId || account.tenantRole === "admin";
  const editor = owner || member?.role === "editor";
  const reviewer = account.tenantRole === "admin" || member?.role === "reviewer";
  return { account, row, owner, editor, reviewer, collaborator: owner || !!member };
}
function revisionView<C extends Omit<TemplateContent, "body" | "guidance">>(
  row: Omit<RevisionRow, "content"> & { content: C }
) {
  return {
    ...row.content,
    id: row.id,
    version: row.version,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    file:
      row.storagePath && row.fileName && row.sizeBytes !== null && row.sha256
        ? { fileName: row.fileName, sizeBytes: row.sizeBytes, sha256: row.sha256 }
        : null,
  };
}

export async function listTemplates(actor: Actor, id?: string): Promise<TemplateView[]> {
  const account = await accountFor(actor);
  const rows = await db
    .select()
    .from(templates)
    .where(and(eq(templates.tenantId, account.tenantId!), id ? eq(templates.id, id) : undefined))
    .orderBy(desc(templates.updatedAt));
  return templateViews(actor, account, rows, false);
}

/** Public listing reads metadata only and applies access/search filters before the page bound. */
export async function listTemplateSummaries(
  actor: Actor,
  raw: Partial<z.infer<typeof templateListQuerySchema>> = {}
): Promise<TemplatePage> {
  const query = templateListQuerySchema.parse(raw);
  const account = await accountFor(actor);
  const collaborator =
    account.tenantRole === "admin"
      ? sql<boolean>`true`
      : or(
          eq(templates.ownerId, actor.userId),
          sql<boolean>`exists (select 1 from ${templateMembers} where ${templateMembers.templateId} = ${templates.id} and ${templateMembers.userId} = ${actor.userId})`
        )!;
  const readablePublished = sql<boolean>`exists (select 1 from ${templateRevisions}
    where ${templateRevisions.id} = ${templates.publishedRevisionId}
    and ${templateRevisions.templateId} = ${templates.id}
    and ${templateRevisions.content}->>'audience' = 'workspace')`;
  const access = or(collaborator, and(ne(templates.status, "archived"), readablePublished));
  const view =
    query.view === "all"
      ? ne(templates.status, "archived")
      : and(
          collaborator,
          eq(
            templates.status,
            query.view === "review"
              ? "review"
              : query.view === "returned"
                ? "changes_requested"
                : "archived"
          )
        );
  const pattern = `%${query.q}%`;
  const search = query.q
    ? or(
        sql<boolean>`exists (select 1 from ${templateRevisions} where ${templateRevisions.id} =
      case when ${collaborator} then ${templates.draftRevisionId} else ${templates.publishedRevisionId} end
      and (${templateRevisions.content}->>'title' ilike ${pattern} or ${templateRevisions.content}->>'category' ilike ${pattern}))`,
        sql<boolean>`exists (select 1 from ${user} where ${user.id} = ${templates.ownerId} and ${user.name} ilike ${pattern})`,
        and(
          collaborator,
          sql<boolean>`exists (select 1 from ${user} where ${user.id} = ${templates.reviewerId} and ${user.name} ilike ${pattern})`
        )
      )
    : undefined;
  const filter = and(eq(templates.tenantId, account.tenantId!), access, view, search);
  if (query.cursor) {
    const [cursor] = await db
      .select({ id: templates.id })
      .from(templates)
      .where(and(filter, eq(templates.id, query.cursor)));
    if (!cursor) throw new TemplateError("This library page changed. Reload the list", 400);
  }
  // Compare in Postgres to preserve timestamp microseconds across page boundaries.
  const afterCursor = query.cursor
    ? sql<boolean>`(${templates.createdAt}, ${templates.id}) <
    (select created_at, id from ${templates} where id = ${query.cursor})`
    : undefined;
  const rows = await db
    .select()
    .from(templates)
    .where(and(filter, afterCursor))
    .orderBy(desc(templates.createdAt), desc(templates.id))
    .limit(query.limit + 1);
  const hasMore = rows.length > query.limit;
  const page = rows.slice(0, query.limit);
  return {
    items: await templateViews(actor, account, page, true),
    nextCursor: hasMore ? page.at(-1)!.id : null,
  };
}

export async function getTemplate(actor: Actor, id: string): Promise<TemplateView> {
  const item = (await listTemplates(actor, id))[0];
  if (!item) throw new TemplateError("Template not found", 404);
  return item;
}

type TemplateRow = typeof templates.$inferSelect;
type Account = Awaited<ReturnType<typeof accountFor>>;
async function templateViews(
  actor: Actor,
  account: Account,
  rows: TemplateRow[],
  summary: false
): Promise<TemplateView[]>;
async function templateViews(
  actor: Actor,
  account: Account,
  rows: TemplateRow[],
  summary: true
): Promise<TemplateSummary[]>;
async function templateViews(
  actor: Actor,
  account: Account,
  rows: TemplateRow[],
  summary: boolean
): Promise<TemplateSummary[]> {
  if (!rows.length) return [];
  const revisionIds = rows
    .flatMap((row) => [row.draftRevisionId, row.publishedRevisionId])
    .filter((value): value is string => value !== null);
  const revisions = !revisionIds.length
    ? []
    : summary
      ? await db
          .select({
            id: templateRevisions.id,
            templateId: templateRevisions.templateId,
            version: templateRevisions.version,
            content: sql<
              Omit<TemplateContent, "body" | "guidance">
            >`${templateRevisions.content} - 'body' - 'guidance'`,
            createdBy: templateRevisions.createdBy,
            createdAt: templateRevisions.createdAt,
            storagePath: templateRevisions.storagePath,
            fileName: templateRevisions.fileName,
            sizeBytes: templateRevisions.sizeBytes,
            sha256: templateRevisions.sha256,
          })
          .from(templateRevisions)
          .where(inArray(templateRevisions.id, revisionIds))
      : await db.select().from(templateRevisions).where(inArray(templateRevisions.id, revisionIds));
  const byId = new Map(revisions.map((revision) => [revision.id, revision]));
  const members = await db
    .select()
    .from(templateMembers)
    .where(
      inArray(
        templateMembers.templateId,
        rows.map((row) => row.id)
      )
    );
  const peopleIds = [
    ...new Set([
      ...rows.flatMap((row) => [row.ownerId, row.reviewerId, row.publishedBy]),
      ...members.map((member) => member.userId),
    ]),
  ].filter((value): value is string => value !== null);
  const people = peopleIds.length
    ? await db
        .select({ id: user.id, name: user.name })
        .from(user)
        .where(and(eq(user.tenantId, account.tenantId!), inArray(user.id, peopleIds)))
    : [];
  const names = new Map(people.map((person) => [person.id, person.name]));
  const readonly = actor.type === "agent" && actor.scope?.maxRole === "viewer";
  const result: TemplateSummary[] = [];
  for (const row of rows) {
    const team = members.filter(
      (member) => member.templateId === row.id && names.has(member.userId)
    );
    const mine = team.find((member) => member.userId === actor.userId);
    const owner = account.tenantRole === "admin" || row.ownerId === actor.userId;
    const collaborator = owner || !!mine;
    const current = row.publishedRevisionId ? byId.get(row.publishedRevisionId) : undefined;
    if (!collaborator && (row.status === "archived" || current?.content.audience !== "workspace"))
      continue;
    const draft = collaborator && row.draftRevisionId ? byId.get(row.draftRevisionId) : undefined;
    const canReview =
      actor.type === "user" &&
      !readonly &&
      (account.tenantRole === "admin" ||
        (mine?.role === "reviewer" && row.reviewerId === actor.userId));
    result.push({
      id: row.id,
      ownerId: row.ownerId,
      ownerName: names.get(row.ownerId ?? "") ?? null,
      status: collaborator ? row.status : "published",
      headCommitId: collaborator ? row.headCommitId! : current!.id,
      canManage: collaborator,
      canEdit: !readonly && (owner || mine?.role === "editor"),
      canReview,
      canPublish: canReview,
      canManageMembers: actor.type === "user" && owner,
      reviewerId: collaborator ? row.reviewerId : null,
      reviewerName: collaborator ? (names.get(row.reviewerId ?? "") ?? null) : null,
      reviewNote: collaborator ? row.reviewNote : null,
      members: collaborator
        ? team.map((member) => ({
            userId: member.userId,
            role: member.role,
            name: names.get(member.userId)!,
          }))
        : [],
      publishedAt: row.publishedAt?.toISOString() ?? null,
      publishedBy: row.publishedBy,
      publishedByName: names.get(row.publishedBy ?? "") ?? null,
      draft: draft ? revisionView(draft) : null,
      current: current ? revisionView(current) : null,
    });
  }
  return result;
}

type UploadedFile = { storagePath: string; fileName: string; sizeBytes: number; sha256: string };
function contentChanges(before: TemplateContent | null, after: TemplateContent): Changes {
  return Object.entries(after)
    .filter(([key, value]) => before?.[key as keyof TemplateContent] !== value)
    .map(([key, value]) => ({
      path: `field/${key}`,
      before: before?.[key as keyof TemplateContent] ?? null,
      after: value,
    }));
}
export async function createTemplate(actor: Actor, raw: TemplateContent, file?: UploadedFile) {
  writable(actor);
  const content = templateContentSchema.parse(raw);
  const id = randomUUID();
  await recordCommit({
    artifactType: "template",
    artifactId: id,
    actor,
    op: "create",
    message: `Created template "${content.title}"`,
    apply: async ({ tx }) => {
      const account = await accountFor(actor, tx);
      const revisionId = randomUUID();
      await tx.insert(templates).values({
        id,
        tenantId: account.tenantId!,
        ownerId: actor.userId,
        draftRevisionId: revisionId,
      });
      if (file) await attachStagedObject(tx, account.tenantId!, file.storagePath);
      await tx.insert(templateRevisions).values({
        id: revisionId,
        templateId: id,
        version: 1,
        content,
        createdBy: actor.userId,
        ...file,
      });
      return {
        changes: [
          ...contentChanges(null, content),
          { path: "field/ownerId", before: null, after: actor.userId },
          { path: "field/status", before: null, after: "draft" },
          { path: "field/draftRevisionId", before: null, after: revisionId },
          ...(file
            ? [
                {
                  path: "field/source",
                  before: null,
                  after: {
                    fileName: file.fileName,
                    sha256: file.sha256,
                    sizeBytes: file.sizeBytes,
                  },
                },
              ]
            : []),
        ],
      };
    },
  });
  return id;
}

export async function saveTemplate(
  actor: Actor,
  id: string,
  raw: z.infer<typeof templateSaveSchema>,
  file?: UploadedFile
) {
  writable(actor);
  const input = templateSaveSchema.parse(raw);
  return mutate(actor, id, input.expectedHead, "save", input.message, async (tx, ctx) => {
    const { row } = ctx;
    if (!ctx.editor) throw new TemplateError("Only a template editor can revise the draft", 403);
    if (row.status === "archived") throw new TemplateError("Restore the template before editing");
    const [before] = await tx
      .select()
      .from(templateRevisions)
      .where(eq(templateRevisions.id, row.draftRevisionId!));
    if (before.storagePath && !file && input.content.body !== before.content.body)
      throw new TemplateError(
        "Replace the Word file to change its language. The preview must match the original file"
      );
    const source = file ?? {
      storagePath: before.storagePath,
      fileName: before.fileName,
      sizeBytes: before.sizeBytes,
      sha256: before.sha256,
    };
    if (file) await attachStagedObject(tx, row.tenantId, file.storagePath);
    const revisionId = randomUUID();
    await tx.insert(templateRevisions).values({
      id: revisionId,
      templateId: id,
      version: before.version + 1,
      content: input.content,
      createdBy: actor.userId,
      ...source,
    });
    await tx
      .update(templates)
      .set({ draftRevisionId: revisionId, status: "draft", reviewerId: null })
      .where(eq(templates.id, id));
    return [
      ...contentChanges(before.content, input.content),
      { path: "field/draftRevisionId", before: row.draftRevisionId, after: revisionId },
      { path: "field/status", before: row.status, after: "draft" },
      { path: "field/reviewerId", before: row.reviewerId, after: null },
      ...(file
        ? [
            {
              path: "field/source",
              before: before.sha256
                ? { fileName: before.fileName, sha256: before.sha256, sizeBytes: before.sizeBytes }
                : null,
              after: { fileName: file.fileName, sha256: file.sha256, sizeBytes: file.sizeBytes },
            },
          ]
        : []),
    ];
  });
}

export async function actOnTemplate(
  actor: Actor,
  id: string,
  raw: z.infer<typeof templateActionSchema>
) {
  writable(actor);
  const input = templateActionSchema.parse(raw);
  return mutate(actor, id, input.expectedHead, input.action, input.message, async (tx, ctx) => {
    const { row, account } = ctx;
    if (actor.type !== "user" && input.action !== "submit")
      throw new TemplateError("A person must make template decisions in the UI", 403);
    if (
      ["set_member", "remove_member", "assign", "archive", "restore"].includes(input.action) &&
      !ctx.owner
    )
      throw new TemplateError(
        "Only the template owner or a workspace admin can manage access and lifecycle",
        403
      );
    if (input.action === "set_member" || input.action === "remove_member") {
      const [target] = await tx
        .select()
        .from(user)
        .where(and(eq(user.id, input.userId ?? ""), eq(user.tenantId, row.tenantId)));
      if (!target || target.id === row.ownerId)
        throw new TemplateError("Choose another member of this workspace");
      const [before] = await tx
        .select()
        .from(templateMembers)
        .where(and(eq(templateMembers.templateId, id), eq(templateMembers.userId, target.id)));
      if (input.action === "set_member") {
        if (!input.role) throw new TemplateError("Choose editor or reviewer", 400);
        await tx
          .insert(templateMembers)
          .values({ templateId: id, userId: target.id, role: input.role })
          .onConflictDoUpdate({
            target: [templateMembers.templateId, templateMembers.userId],
            set: { role: input.role },
          });
      } else
        await tx
          .delete(templateMembers)
          .where(and(eq(templateMembers.templateId, id), eq(templateMembers.userId, target.id)));
      // A removed/downgraded reviewer cannot leave an apparently assigned review behind.
      const invalidatesReview =
        row.reviewerId === target.id &&
        (input.action === "remove_member" || input.role !== "reviewer") &&
        target.tenantRole !== "admin";
      if (invalidatesReview)
        await tx
          .update(templates)
          .set({ reviewerId: null, status: row.status === "review" ? "draft" : row.status })
          .where(eq(templates.id, id));
      return [
        {
          path: `member/${target.id}`,
          before: before?.role ?? null,
          after: input.action === "set_member" ? input.role : null,
        },
        ...(invalidatesReview
          ? [
              { path: "field/reviewerId", before: row.reviewerId, after: null },
              {
                path: "field/status",
                before: row.status,
                after: row.status === "review" ? "draft" : row.status,
              },
            ]
          : []),
      ];
    }
    if (input.action === "assign") {
      const [owner] = await tx
        .select()
        .from(user)
        .where(and(eq(user.id, input.ownerId ?? ""), eq(user.tenantId, row.tenantId)));
      if (!owner) throw new TemplateError("Choose an owner in this workspace");
      const [member] = await tx
        .select()
        .from(templateMembers)
        .where(and(eq(templateMembers.templateId, id), eq(templateMembers.userId, owner.id)));
      await tx
        .delete(templateMembers)
        .where(and(eq(templateMembers.templateId, id), eq(templateMembers.userId, owner.id)));
      const invalidatesReview = row.reviewerId === owner.id && owner.tenantRole !== "admin";
      await tx
        .update(templates)
        .set({
          ownerId: owner.id,
          ...(invalidatesReview
            ? { reviewerId: null, status: row.status === "review" ? "draft" : row.status }
            : {}),
        })
        .where(eq(templates.id, id));
      return [
        { path: "field/ownerId", before: row.ownerId, after: owner.id },
        ...(member ? [{ path: `member/${owner.id}`, before: member.role, after: null }] : []),
        ...(invalidatesReview
          ? [
              { path: "field/reviewerId", before: row.reviewerId, after: null },
              {
                path: "field/status",
                before: row.status,
                after: row.status === "review" ? "draft" : row.status,
              },
            ]
          : []),
      ];
    }
    if (input.action === "submit") {
      if (!ctx.editor) throw new TemplateError("Only a template editor can submit a draft", 403);
      if (
        !["draft", "changes_requested"].includes(row.status) ||
        row.draftRevisionId === row.publishedRevisionId
      )
        throw new TemplateError("Only an unpublished draft can be submitted");
      const [reviewer] = await tx
        .select()
        .from(user)
        .where(and(eq(user.id, input.reviewerId ?? ""), eq(user.tenantId, row.tenantId)));
      const [delegated] = reviewer
        ? await tx
            .select()
            .from(templateMembers)
            .where(
              and(
                eq(templateMembers.templateId, id),
                eq(templateMembers.userId, reviewer.id),
                eq(templateMembers.role, "reviewer")
              )
            )
        : [];
      if (!reviewer || (reviewer.tenantRole !== "admin" && !delegated))
        throw new TemplateError("Choose a workspace admin or a delegated template reviewer");
      await tx
        .update(templates)
        .set({ status: "review", reviewerId: reviewer.id, reviewNote: null })
        .where(eq(templates.id, id));
      return [
        { path: "field/status", before: row.status, after: "review" },
        { path: "field/reviewerId", before: row.reviewerId, after: reviewer.id },
        { path: "field/reviewNote", before: row.reviewNote, after: null },
      ];
    }
    if (input.action === "publish" || input.action === "request_changes") {
      if (!(account.tenantRole === "admin" || (ctx.reviewer && row.reviewerId === actor.userId)))
        throw new TemplateError(
          "Only the assigned reviewer or a workspace admin can decide this review",
          403
        );
      if (row.status !== "review" || input.revisionId !== row.draftRevisionId)
        throw new TemplateError("The reviewed revision changed. Reload before deciding");
      const status = input.action === "publish" ? "published" : "changes_requested";
      const publishedAt = new Date();
      await tx
        .update(templates)
        .set({
          status,
          ...(input.action === "publish"
            ? {
                publishedRevisionId: row.draftRevisionId,
                publishedAt,
                publishedBy: actor.userId,
                reviewNote: null,
              }
            : { reviewNote: input.message }),
        })
        .where(eq(templates.id, id));
      return [
        { path: "field/status", before: row.status, after: status },
        ...(input.action === "publish"
          ? [
              {
                path: "field/publishedRevisionId",
                before: row.publishedRevisionId,
                after: row.draftRevisionId,
              },
              { path: "field/publishedBy", before: row.publishedBy, after: actor.userId },
              {
                path: "field/publishedAt",
                before: row.publishedAt?.toISOString() ?? null,
                after: publishedAt.toISOString(),
              },
              { path: "field/reviewNote", before: row.reviewNote, after: null },
            ]
          : [{ path: "field/reviewNote", before: row.reviewNote, after: input.message }]),
      ];
    }
    if (input.action === "restore" ? row.status !== "archived" : row.status === "archived")
      throw new TemplateError("The template lifecycle changed. Reload and try again");
    const status = input.action === "archive" ? "archived" : "draft";
    await tx
      .update(templates)
      .set({
        status,
        reviewerId: null,
        ...(input.action === "restore"
          ? { publishedRevisionId: null, publishedAt: null, publishedBy: null }
          : {}),
      })
      .where(eq(templates.id, id));
    return [
      { path: "field/status", before: row.status, after: status },
      { path: "field/reviewerId", before: row.reviewerId, after: null },
      ...(input.action === "restore"
        ? [
            { path: "field/publishedRevisionId", before: row.publishedRevisionId, after: null },
            { path: "field/publishedBy", before: row.publishedBy, after: null },
            {
              path: "field/publishedAt",
              before: row.publishedAt?.toISOString() ?? null,
              after: null,
            },
          ]
        : []),
    ];
  });
}

type TemplateContext = Awaited<ReturnType<typeof contextFor>>;
async function mutate(
  actor: Actor,
  id: string,
  expectedHead: string,
  op: string,
  message: string,
  apply: (tx: Tx, ctx: TemplateContext) => Promise<Changes>
) {
  return recordCommit({
    artifactType: "template",
    artifactId: id,
    actor,
    op,
    message,
    apply: async ({ tx }) => {
      const ctx = await contextFor(actor, id, tx);
      if (!ctx.collaborator) throw new TemplateError("Forbidden", 403);
      if (ctx.row.headCommitId !== expectedHead)
        throw new TemplateError("This template changed. Reload before saving");
      const changes = await apply(tx, ctx);
      await tx.update(templates).set({ updatedAt: new Date() }).where(eq(templates.id, id));
      return { changes };
    },
  });
}

export async function templateHistory(actor: Actor, id: string) {
  const ctx = await contextFor(actor, id);
  if (!ctx.collaborator) throw new TemplateError("Forbidden", 403);
  const history = await listCommits("template", id);
  return Promise.all(
    history.map(async (commit) => ({ ...commit, changes: await getCommitChanges(commit.id) }))
  );
}
export async function currentTemplate(actor: Actor, id: string) {
  const item = (await listTemplates(actor, id)).find((entry) => entry.id === id);
  if (!item || item.status === "archived" || !item.current)
    throw new TemplateError("No published template available", 404);
  return item.current;
}

/** Upload bytes are server-owned; clients never submit a storage key or source hash. */
export async function uploadTemplateFile(
  actor: Actor,
  raw: TemplateContent,
  bytes: Buffer,
  fileName: string,
  existing?: { id: string; expectedHead: string; message: string }
) {
  writable(actor);
  const account = await accountFor(actor);
  if (existing) {
    const ctx = await contextFor(actor, existing.id);
    if (!ctx.editor)
      throw new TemplateError("Only a template editor can replace the Word file", 403);
    if (ctx.row.headCommitId !== existing.expectedHead)
      throw new TemplateError("This template changed. Reload before saving");
    if (ctx.row.status === "archived")
      throw new TemplateError("Restore the template before editing");
  }
  if (!bytes.length || bytes.length > MAX_TEMPLATE_FILE_BYTES)
    throw new TemplateError("Choose a Word file up to 20 MiB", 413);
  if (!/\.docx$/i.test(fileName)) throw new TemplateError("Choose a .docx Word document", 400);
  const inspection = await inspectDocx(bytes);
  if (
    inspection.status !== "complete" ||
    inspection.reasons.some((reason) => reason !== "limited_body_content") ||
    Object.values(inspection.revisions).some((count) => count > 0)
  )
    throw new TemplateError("Use a valid Word document with all tracked changes resolved", 400);
  const extracted = await extractMarkdown(bytes, "docx");
  const content = templateContentSchema.parse({ ...raw, body: extracted.markdown });
  const key = buildStoragePath({
    tenantId: account.tenantId!,
    userId: actor.userId,
    artifactId: randomUUID(),
    ext: "docx",
  });
  await putStagedObject(
    account.tenantId!,
    key,
    bytes,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
  const file: UploadedFile = {
    storagePath: key,
    fileName: fileName.split(/[\\/]/).at(-1)!.slice(0, 200),
    sizeBytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  if (existing) {
    await saveTemplate(
      actor,
      existing.id,
      { expectedHead: existing.expectedHead, message: existing.message, content },
      file
    );
    return existing.id;
  }
  return createTemplate(actor, content, file);
}

export function templateDownloadFilename(title: string, version: number) {
  const name =
    title
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "template";
  return `${name}-v${version}.docx`;
}
export async function downloadTemplate(actor: Actor, id: string, revisionId?: string) {
  const ctx = await contextFor(actor, id);
  const selected = revisionId ?? ctx.row.publishedRevisionId;
  const [revision] = selected
    ? await db
        .select()
        .from(templateRevisions)
        .where(and(eq(templateRevisions.id, selected), eq(templateRevisions.templateId, id)))
    : [];
  if (!revision) throw new TemplateError("No published template available", 404);
  const current = revision.id === ctx.row.publishedRevisionId;
  if (
    !ctx.collaborator &&
    (ctx.row.status === "archived" || !current || revision.content.audience !== "workspace")
  )
    throw new TemplateError("No published template available", 404);
  if (!revisionId && ctx.row.status === "archived")
    throw new TemplateError("No published template available", 404);
  const bytes = revision.storagePath
    ? await getObject(ctx.row.tenantId, revision.storagePath)
    : await generateDocx({
        title: revision.content.title,
        blocks: revision.content.body
          .split(/\n\s*\n/)
          .map((text) => ({ type: "paragraph" as const, text })),
      });
  if (revision.sha256 && createHash("sha256").update(bytes).digest("hex") !== revision.sha256)
    throw new TemplateError("The stored file does not match this revision. Download was blocked");
  return {
    bytes,
    filename: templateDownloadFilename(revision.content.title, revision.version),
    revisionId: revision.id,
  };
}
