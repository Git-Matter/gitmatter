import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@workspace/db/client";
import {
  commits,
  hiddenWorkflows,
  matterMembers,
  matters,
  user,
  workflowShares,
  workflows,
} from "@workspace/db/schema";
import type {
  PlaybookRule,
  TabularColumn,
  Workflow,
  WorkflowShare,
  WorkflowStatus,
  WorkflowStep,
} from "@workspace/db/schema";
import { type Actor, recordCommit } from "../core/commit.js";
import { canAccessArtifact, getUserTenant } from "../core/access.js";

type WorkflowInput = {
  title: string;
  type: "assistant" | "tabular" | "playbook";
  promptMd: string;
  steps?: WorkflowStep[] | null;
  columnsConfig?: TabularColumn[];
  rules?: PlaybookRule[] | null;
  status?: WorkflowStatus;
  practice?: string | null;
};

// Access flags layered onto a workflow row for the current viewer. Mirrors the
// shape the UI reads (is_owner / allow_edit / shared_by_name) but camelCased.
export type WorkflowAccess = {
  isOwner: boolean;
  allowEdit: boolean;
  sharedByName: string | null;
  // People with access besides the owner: matter members (matter sharing cascades
  // to the workflow) + per-email shares. Drives the "Shared"/"Private" label.
  shareCount: number;
};

export type EnrichedWorkflow = Workflow & WorkflowAccess & { hidden: boolean };

export async function createWorkflow(
  actor: Actor,
  input: WorkflowInput & { matterId?: string | null; tenantId?: string }
) {
  const workflowId = randomUUID();
  const [matter, actorTenantId] = await Promise.all([
    input.matterId
      ? db
          .select({ tenantId: matters.tenantId })
          .from(matters)
          .where(eq(matters.id, input.matterId))
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    input.matterId ? Promise.resolve(null) : getUserTenant(actor.userId),
  ]);
  if (input.matterId && !matter) throw new Error("Matter not found");
  const tenantId = matter?.tenantId ?? input.tenantId ?? actorTenantId;
  if (!tenantId) throw new Error("No tenant");
  if (input.type !== "playbook" && !input.matterId)
    throw new Error("Only playbooks can be created in the firm library");
  await recordCommit({
    artifactType: "workflow",
    artifactId: workflowId,
    actor,
    op: "create",
    message: `Created workflow "${input.title}"`,
    apply: async ({ tx, commitId }) => {
      const fieldCommits: Record<string, string> = {
        "field/title": commitId,
        "field/type": commitId,
        "field/prompt_md": commitId,
        "field/steps": commitId,
        "field/columns_config": commitId,
        "field/rules": commitId,
        "field/status": commitId,
        "field/practice": commitId,
      };
      await tx.insert(workflows).values({
        id: workflowId,
        userId: actor.userId,
        tenantId,
        matterId: input.matterId ?? null,
        createdBy: actor.userId,
        title: input.title,
        type: input.type,
        promptMd: input.promptMd,
        steps: input.steps ?? null,
        columnsConfig: input.columnsConfig ?? null,
        rules: input.rules ?? null,
        // Playbooks join the library lifecycle as drafts; other workflow types
        // keep the pre-lifecycle behavior (immediately usable).
        status: input.status ?? (input.type === "playbook" ? "draft" : "approved"),
        practice: input.practice ?? null,
        fieldCommits,
      });
      return {
        changes: [
          { path: "field/title", before: null, after: input.title },
          { path: "field/type", before: null, after: input.type },
          { path: "field/prompt_md", before: null, after: input.promptMd },
          { path: "field/steps", before: null, after: input.steps ?? null },
          { path: "field/columns_config", before: null, after: input.columnsConfig ?? null },
          { path: "field/rules", before: null, after: input.rules ?? null },
          { path: "field/status", before: null, after: input.status ?? null },
          { path: "field/practice", before: null, after: input.practice ?? null },
        ],
      };
    },
  });
  return workflowId;
}

export async function updateWorkflow(
  actor: Actor,
  workflowId: string,
  patch: Partial<WorkflowInput>
) {
  const [wf] = await db.select().from(workflows).where(eq(workflows.id, workflowId));
  if (!wf) throw new Error("Workflow not found");

  const fields: Array<{ key: string; col: keyof typeof wf; before: unknown; after: unknown }> = [];
  if (patch.title !== undefined && patch.title !== wf.title)
    fields.push({ key: "field/title", col: "title", before: wf.title, after: patch.title });
  if (patch.type !== undefined && patch.type !== wf.type)
    fields.push({ key: "field/type", col: "type", before: wf.type, after: patch.type });
  if (patch.promptMd !== undefined && patch.promptMd !== wf.promptMd)
    fields.push({
      key: "field/prompt_md",
      col: "promptMd",
      before: wf.promptMd,
      after: patch.promptMd,
    });
  if (patch.steps !== undefined)
    fields.push({
      key: "field/steps",
      col: "steps",
      before: wf.steps,
      after: patch.steps,
    });
  if (patch.columnsConfig !== undefined)
    fields.push({
      key: "field/columns_config",
      col: "columnsConfig",
      before: wf.columnsConfig,
      after: patch.columnsConfig,
    });
  if (patch.rules !== undefined)
    fields.push({
      key: "field/rules",
      col: "rules",
      before: wf.rules,
      after: patch.rules,
    });
  if (patch.status !== undefined && patch.status !== wf.status)
    fields.push({ key: "field/status", col: "status", before: wf.status, after: patch.status });
  if (patch.practice !== undefined && patch.practice !== wf.practice)
    fields.push({
      key: "field/practice",
      col: "practice",
      before: wf.practice,
      after: patch.practice,
    });

  if (!fields.length) return { commit: null, changes: [] };

  return recordCommit({
    artifactType: "workflow",
    artifactId: workflowId,
    actor,
    op: "update",
    message: `Updated ${fields.map((f) => f.key.replace("field/", "")).join(", ")}`,
    apply: async ({ tx, commitId }) => {
      const set: Record<string, unknown> = { updatedAt: new Date() };
      const fieldCommits = { ...wf.fieldCommits };
      for (const f of fields) {
        set[f.col as string] = f.after;
        fieldCommits[f.key] = commitId;
      }
      set.fieldCommits = fieldCommits;
      await tx.update(workflows).set(set).where(eq(workflows.id, workflowId));
      return { changes: fields.map((f) => ({ path: f.key, before: f.before, after: f.after })) };
    },
  });
}

// Layer per-viewer access flags + the `hidden` marker onto raw workflow rows.
// Shared by listWorkflows (full set) and listWorkflowsPage (a page).
async function enrichWorkflows(
  rows: Workflow[],
  userId: string,
  ctx: {
    hiddenIds: string[];
    shareByWorkflow: Map<string, WorkflowShare>;
    tenantId: string | null;
    tenantRole: "admin" | "member" | null;
  }
): Promise<EnrichedWorkflow[]> {
  const ownerIds = [
    ...new Set(
      rows
        .filter((r) => !r.isSystem && r.userId && r.userId !== userId)
        .map((r) => r.userId as string)
    ),
  ];
  const owners = ownerIds.length
    ? await db
        .select({ id: user.id, name: user.name, email: user.email })
        .from(user)
        .where(inArray(user.id, ownerIds))
    : [];
  const ownerName = new Map(owners.map((o) => [o.id, o.name || o.email]));
  const hiddenSet = new Set(ctx.hiddenIds);
  const shareCounts = await workflowShareCounts(rows);

  return rows.map((r) => {
    const isOwner = !r.isSystem && r.userId === userId;
    const share = ctx.shareByWorkflow.get(r.id);
    const isFirmPlaybook =
      r.type === "playbook" && !r.matterId && r.tenantId !== null && r.tenantId === ctx.tenantId;
    const allowEdit = r.isSystem
      ? false
      : isFirmPlaybook
        ? r.status === "draft"
          ? isOwner || ctx.tenantRole === "admin"
          : ctx.tenantRole === "admin"
        : isOwner
          ? true
          : (share?.allowEdit ?? false);
    const sharedByName =
      !r.isSystem && !isOwner
        ? isFirmPlaybook
          ? "Firm library"
          : (ownerName.get(r.userId ?? "") ?? "Shared")
        : null;
    return {
      ...r,
      isOwner,
      allowEdit,
      sharedByName,
      shareCount: shareCounts.get(r.id) ?? 0,
      hidden: hiddenSet.has(r.id),
    };
  });
}

/**
 * People with access to each workflow besides its owner: its matter's members
 * (excluding the owner, who is always a member) plus its per-email shares. Drives
 * the "Shared" vs "Private" label, so only the >0 distinction matters. System
 * workflows have no owner/matter, so they count 0.
 */
async function workflowShareCounts(rows: Workflow[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const shareable = rows.filter((r) => !r.isSystem);
  if (!shareable.length) return out;

  const matterIds = [...new Set(shareable.map((r) => r.matterId).filter((x): x is string => !!x))];
  const memberRows = matterIds.length
    ? await db
        .select({ matterId: matterMembers.matterId, userId: matterMembers.userId })
        .from(matterMembers)
        .where(inArray(matterMembers.matterId, matterIds))
    : [];
  const membersByMatter = new Map<string, string[]>();
  for (const m of memberRows) {
    const list = membersByMatter.get(m.matterId) ?? [];
    list.push(m.userId);
    membersByMatter.set(m.matterId, list);
  }

  const ids = shareable.map((r) => r.id);
  const emailRows = await db
    .select({ workflowId: workflowShares.workflowId, email: workflowShares.sharedWithEmail })
    .from(workflowShares)
    .where(inArray(workflowShares.workflowId, ids));
  const emailsByWorkflow = new Map<string, string[]>();
  for (const e of emailRows) {
    const list = emailsByWorkflow.get(e.workflowId) ?? [];
    list.push(e.email);
    emailsByWorkflow.set(e.workflowId, list);
  }

  for (const r of shareable) {
    const members = (membersByMatter.get(r.matterId ?? "") ?? []).filter((id) => id !== r.userId);
    const emails = emailsByWorkflow.get(r.id) ?? [];
    out.set(r.id, members.length + emails.length);
  }
  return out;
}

// Built-ins + the user's own + workflows shared to their email, each tagged with
// per-viewer access flags and a `hidden` marker. The full set — used by the
// workflow pickers and the run modal; the list page uses listWorkflowsPage.
export async function listWorkflows(userId: string, email?: string): Promise<EnrichedWorkflow[]> {
  const ctx = await workflowAccessContext(userId, email);
  const rows = await db
    .select()
    .from(workflows)
    .where(
      or(
        eq(workflows.isSystem, true),
        eq(workflows.userId, userId),
        ctx.sharedIds.length ? inArray(workflows.id, ctx.sharedIds) : undefined,
        ctx.tenantId
          ? and(
              eq(workflows.type, "playbook"),
              isNull(workflows.matterId),
              eq(workflows.tenantId, ctx.tenantId)
            )
          : undefined
      )
    );
  return enrichWorkflows(rows, userId, ctx);
}

// Resolve a viewer's access to one workflow. Covers ownership, per-email shares,
// and matter membership (system templates are read-only-public).
async function resolveWorkflowAccess(
  wf: Workflow,
  userId: string,
  email?: string
): Promise<WorkflowAccess & { canView: boolean; canEdit: boolean }> {
  if (wf.isSystem)
    return {
      isOwner: false,
      allowEdit: false,
      sharedByName: null,
      shareCount: 0,
      canView: true,
      canEdit: false,
    };
  const shareCount = (await workflowShareCounts([wf])).get(wf.id) ?? 0;
  const [account] = await db
    .select({ tenantId: user.tenantId, tenantRole: user.tenantRole })
    .from(user)
    .where(eq(user.id, userId));
  const isFirmPlaybook =
    wf.type === "playbook" &&
    !wf.matterId &&
    wf.tenantId !== null &&
    wf.tenantId === account?.tenantId;
  if (isFirmPlaybook) {
    const isOwner = wf.userId === userId;
    const canEdit =
      wf.status === "draft"
        ? isOwner || account?.tenantRole === "admin"
        : account?.tenantRole === "admin";
    return {
      isOwner,
      allowEdit: canEdit,
      sharedByName: isOwner ? null : "Firm library",
      shareCount,
      canView: true,
      canEdit,
    };
  }
  if (wf.userId === userId)
    return {
      isOwner: true,
      allowEdit: true,
      sharedByName: null,
      shareCount,
      canView: true,
      canEdit: true,
    };

  const e = email?.trim().toLowerCase() || null;
  const [matterEdit, share] = await Promise.all([
    canAccessArtifact(userId, "workflow", wf.id, "editor"),
    e
      ? db
          .select()
          .from(workflowShares)
          .where(and(eq(workflowShares.workflowId, wf.id), eq(workflowShares.sharedWithEmail, e)))
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);
  const matterView = matterEdit || (await canAccessArtifact(userId, "workflow", wf.id, "viewer"));
  const canView = matterView || !!share;
  const canEdit = matterEdit || (share?.allowEdit ?? false);
  let sharedByName: string | null = null;
  if (canView && wf.userId) {
    const [owner] = await db
      .select({ name: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, wf.userId));
    sharedByName = owner?.name || owner?.email || "Shared";
  }
  return { isOwner: false, allowEdit: canEdit, sharedByName, shareCount, canView, canEdit };
}

export type WorkflowListTab = "all" | "builtin" | "custom" | "hidden";
export type WorkflowListType = "assistant" | "tabular" | "playbook";
export type WorkflowListSort = "title" | "type" | "createdAt" | "updatedAt" | "practice" | "source";

export type WorkflowListParams = {
  q?: string;
  tab?: WorkflowListTab;
  type?: WorkflowListType;
  practice?: string;
  excludePlaybooks?: boolean;
  page: number;
  pageSize: number;
  sort?: WorkflowListSort;
  dir?: "asc" | "desc";
};

// Per-viewer access data fetched once: which built-ins this user has hidden, and
// which workflows are shared to their email. Drives both the paged list and the
// practice-filter dropdown so they resolve the same set.
async function workflowAccessContext(userId: string, email?: string) {
  const e = email?.trim().toLowerCase() || null;
  const [hiddenRows, shareRows, account] = await Promise.all([
    db
      .select({ id: hiddenWorkflows.workflowId })
      .from(hiddenWorkflows)
      .where(eq(hiddenWorkflows.userId, userId)),
    e
      ? db.select().from(workflowShares).where(eq(workflowShares.sharedWithEmail, e))
      : Promise.resolve([] as WorkflowShare[]),
    db
      .select({ tenantId: user.tenantId, tenantRole: user.tenantRole })
      .from(user)
      .where(eq(user.id, userId))
      .then((rows) => rows[0] ?? null),
  ]);
  return {
    hiddenIds: hiddenRows.map((h) => h.id),
    sharedIds: shareRows.map((s) => s.workflowId),
    shareByWorkflow: new Map(shareRows.map((s) => [s.workflowId, s])),
    tenantId: account?.tenantId ?? null,
    tenantRole: account?.tenantRole ?? null,
  };
}

// The WHERE shared by the paged list and the practices dropdown. Tab semantics
// mirror the old client-side useWorkflowFilters: builtin = visible system,
// hidden = system the user hid, custom = the user's own + shared, all = the lot
// minus hidden built-ins.
function workflowListWhere(
  userId: string,
  ctx: { hiddenIds: string[]; sharedIds: string[]; tenantId: string | null },
  f: {
    tab?: WorkflowListTab;
    type?: WorkflowListType;
    practice?: string;
    q?: string;
    excludePlaybooks?: boolean;
  }
) {
  const { hiddenIds, sharedIds } = ctx;
  const accessible = or(
    eq(workflows.isSystem, true),
    eq(workflows.userId, userId),
    sharedIds.length ? inArray(workflows.id, sharedIds) : undefined,
    ctx.tenantId
      ? and(
          eq(workflows.type, "playbook"),
          isNull(workflows.matterId),
          eq(workflows.tenantId, ctx.tenantId)
        )
      : undefined
  );
  const notHidden = hiddenIds.length ? notInArray(workflows.id, hiddenIds) : undefined;
  const isHidden = hiddenIds.length ? inArray(workflows.id, hiddenIds) : sql`false`;
  const tab = f.tab ?? "all";
  const tabWhere =
    tab === "builtin"
      ? and(eq(workflows.isSystem, true), notHidden)
      : tab === "hidden"
        ? and(eq(workflows.isSystem, true), isHidden)
        : tab === "custom"
          ? eq(workflows.isSystem, false)
          : notHidden; // "all"
  const q = f.q?.trim();
  return and(
    accessible,
    tabWhere,
    f.type ? eq(workflows.type, f.type) : undefined,
    f.excludePlaybooks ? ne(workflows.type, "playbook") : undefined,
    f.practice ? eq(workflows.practice, f.practice) : undefined,
    q ? ilike(workflows.title, `%${q}%`) : undefined
  );
}

export async function listWorkflowsPage(
  userId: string,
  email: string | undefined,
  params: WorkflowListParams
): Promise<{ rows: EnrichedWorkflow[]; rowCount: number }> {
  const ctx = await workflowAccessContext(userId, email);
  const where = workflowListWhere(userId, ctx, params);
  const sortCols = {
    title: workflows.title,
    type: workflows.type,
    createdAt: workflows.createdAt,
    updatedAt: workflows.updatedAt,
    practice: workflows.practice,
    // Source groups: built-in first, then mine, then shared-by-others.
    source: sql`case when ${workflows.isSystem} then 0 when ${workflows.userId} = ${userId} then 1 else 2 end`,
  };
  const sortCol = sortCols[params.sort ?? "title"];
  const order = params.dir === "asc" ? asc(sortCol) : desc(sortCol);
  const offset = params.page * params.pageSize;

  const [rows, countRows] = await Promise.all([
    db.select().from(workflows).where(where).orderBy(order).limit(params.pageSize).offset(offset),
    db.select({ count: count() }).from(workflows).where(where),
  ]);

  return {
    rows: await enrichWorkflows(rows, userId, ctx),
    rowCount: Number(countRows[0]?.count ?? 0),
  };
}

/** Distinct non-null practices within the current tab/type — powers the practice
 *  filter dropdown (which can no longer be derived from a fully-loaded list). */
export async function listWorkflowPractices(
  userId: string,
  email: string | undefined,
  opts: { tab?: WorkflowListTab; type?: WorkflowListType; excludePlaybooks?: boolean }
): Promise<string[]> {
  const ctx = await workflowAccessContext(userId, email);
  const where = and(
    workflowListWhere(userId, ctx, {
      tab: opts.tab,
      type: opts.type,
      excludePlaybooks: opts.excludePlaybooks,
    }),
    isNotNull(workflows.practice)
  );
  const rows = await db
    .selectDistinct({ practice: workflows.practice })
    .from(workflows)
    .where(where);
  return [...new Set(rows.map((r) => r.practice).filter((p): p is string => !!p))].sort();
}

async function blameFor(wf: Workflow): Promise<Record<string, unknown>> {
  const commitIds = [...new Set(Object.values(wf.fieldCommits ?? {}))];
  const blameRows = commitIds.length
    ? await db.select().from(commits).where(inArray(commits.id, commitIds))
    : [];
  const blameById = new Map(blameRows.map((b) => [b.id, b]));
  const blame: Record<string, unknown> = {};
  for (const [field, cid] of Object.entries(wf.fieldCommits ?? {})) {
    blame[field] = blameById.get(cid) ?? null;
  }
  return blame;
}

export async function getWorkflow(workflowId: string) {
  const [wf] = await db.select().from(workflows).where(eq(workflows.id, workflowId));
  if (!wf) return null;
  return { workflow: wf, blame: await blameFor(wf) };
}

// Like getWorkflow, but resolves the viewer's access and attaches access flags
// to the workflow. Returns null when the workflow doesn't exist; callers gate on
// `access.canView` / `access.canEdit`.
export async function getWorkflowForViewer(workflowId: string, userId: string, email?: string) {
  const [wf] = await db.select().from(workflows).where(eq(workflows.id, workflowId));
  if (!wf) return null;
  const access = await resolveWorkflowAccess(wf, userId, email);
  return {
    workflow: {
      ...wf,
      isOwner: access.isOwner,
      allowEdit: access.allowEdit,
      sharedByName: access.sharedByName,
      shareCount: access.shareCount,
    },
    blame: await blameFor(wf),
    access,
  };
}

// Hard-delete a workflow (owner only). Cascades remove shares, hidden markers,
// and field changes; commits remain as orphaned history. Done outside
// recordCommit because that path stamps a head pointer on the (now gone) row.
export async function deleteWorkflow(actor: Actor, workflowId: string) {
  const [wf] = await db.select().from(workflows).where(eq(workflows.id, workflowId));
  if (!wf) throw new Error("Workflow not found");
  if (wf.isSystem || wf.userId !== actor.userId) throw new Error("Forbidden");
  await db.delete(workflows).where(eq(workflows.id, workflowId));
}

// ---------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------
export async function listWorkflowShares(workflowId: string) {
  return db
    .select()
    .from(workflowShares)
    .where(eq(workflowShares.workflowId, workflowId))
    .orderBy(asc(workflowShares.createdAt));
}

export async function shareWorkflow(
  actor: Actor,
  workflowId: string,
  input: { emails: string[]; allowEdit: boolean }
) {
  const emails = [
    ...new Set(input.emails.map((e) => e.trim().toLowerCase()).filter((e) => e.length > 0)),
  ];
  for (const email of emails) {
    await db
      .insert(workflowShares)
      .values({
        workflowId,
        sharedWithEmail: email,
        allowEdit: input.allowEdit,
        createdBy: actor.userId,
      })
      .onConflictDoUpdate({
        target: [workflowShares.workflowId, workflowShares.sharedWithEmail],
        set: { allowEdit: input.allowEdit },
      });
  }
  return listWorkflowShares(workflowId);
}

export async function deleteWorkflowShare(workflowId: string, shareId: string) {
  await db
    .delete(workflowShares)
    .where(and(eq(workflowShares.id, shareId), eq(workflowShares.workflowId, workflowId)));
}

// ---------------------------------------------------------------------------
// Hidden built-ins (per user)
// ---------------------------------------------------------------------------
export async function listHiddenWorkflows(userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: hiddenWorkflows.workflowId })
    .from(hiddenWorkflows)
    .where(eq(hiddenWorkflows.userId, userId));
  return rows.map((r) => r.id);
}

export async function hideWorkflow(userId: string, workflowId: string) {
  await db
    .insert(hiddenWorkflows)
    .values({ userId, workflowId })
    .onConflictDoNothing({ target: [hiddenWorkflows.userId, hiddenWorkflows.workflowId] });
}

export async function unhideWorkflow(userId: string, workflowId: string) {
  await db
    .delete(hiddenWorkflows)
    .where(and(eq(hiddenWorkflows.userId, userId), eq(hiddenWorkflows.workflowId, workflowId)));
}

const BUILTINS: WorkflowInput[] = [
  {
    title: "Contract Summary",
    type: "assistant",
    promptMd:
      "Summarize this contract: parties, term, key obligations, termination, governing law, and any unusual or risky clauses.",
  },
  {
    title: "Credit Agreement Summary",
    type: "assistant",
    promptMd: [
      "## Credit Agreement Review",
      "",
      "Read the attached facility/credit agreement and prepare a structured briefing note. Work through the groups below. For each point, state the position, cite the clause or schedule it comes from, and call out anything off-market, borrower-unfriendly, or that a credit committee would want escalated.",
      "",
      "**Parties & roles**",
      "- Borrower(s) and the wider obligor group, with incorporation jurisdiction",
      "- Lenders and their syndicate roles (arranger, original lender, facility agent, security agent)",
      "- Guarantors and the reach of each guarantee",
      "- Other named parties (issuing bank, hedge counterparties) and why they appear",
      "",
      "**Money & pricing**",
      "- Each facility, its type and tranche, and the permitted use of proceeds",
      "- Total commitments, currency, and the split across tranches",
      "- Pricing: reference rate, margin, any ratchet, and how interest periods work",
      "- Fees (commitment, utilisation, agency) and the basis each is calculated on",
      "",
      "**Repayment & maturity**",
      "- Amortisation profile versus bullet, with instalment dates and amounts",
      "- Final maturity for each facility",
      "- Mandatory and voluntary prepayment, plus any make-whole, call protection or break costs",
      "",
      "**Credit support**",
      "- The security package: each charge, pledge or mortgage and the assets it covers",
      "- Guarantee limitations (upstream limits, coverage tests)",
      "",
      "**Covenants & default**",
      "- Financial covenants: the metric, the level, test dates, and any equity cure",
      "- Information and general undertakings worth flagging",
      "- Events of default, with grace periods, materiality hooks and cross-default",
      "- Change-of-control trigger and what it forces (prepay, cancel, consent)",
      "- Transfer and assignment limits on either side (whitelists, consent rights)",
      "",
      "**Boilerplate**",
      "- Governing law and how disputes are resolved (forum, seat, arbitration versus courts)",
      "",
      "Write the note straight into your chat reply. Only build a Word file if the user asks for one.",
    ].join("\n"),
  },
  {
    title: "Shareholder Agreement Summary",
    type: "assistant",
    promptMd: [
      "## Shareholders' Agreement Review",
      "",
      "Read the attached shareholders' or investment agreement and prepare a structured briefing note. For each item, give the position, quote the governing clause, and flag terms that are unusual, one-sided, or that diverge from market standard.",
      "",
      "**Cap table & share rights**",
      "- Parties, the class of shares each holds, and fully-diluted percentages",
      "- Per class: voting, dividend, liquidation preference, conversion and redemption",
      "",
      "**Governance**",
      "- Board size, and who may appoint or remove directors (with the stake needed to keep that right)",
      "- Quorum and the chair's casting vote",
      "- Reserved matters: the decisions needing a supermajority or consent, the threshold, and whose consent",
      "",
      "**Moving shares**",
      "- Pre-emption on new issues: who benefits, the process, and carve-outs (e.g. option pools)",
      "- Transfer restrictions: lock-ups, permitted versus prohibited transfers, approvals",
      "- Rights of first refusal, drag-along and tag-along: triggers, thresholds, pricing, protections",
      "",
      "**Economic protection**",
      "- Anti-dilution: the mechanism (full ratchet, weighted average), triggers, and carve-outs",
      "- Dividend policy and any restrictions on distributions",
      "",
      "**Exit & restraints**",
      "- Agreed exit routes (trade sale, IPO, drag) and timing; the liquidation waterfall on exit",
      "- Deadlock: how it is defined and broken (put/call, Russian roulette) and the fallback",
      "- Non-compete and non-solicit: who is bound, scope, duration, carve-outs",
      "",
      "**Boilerplate**",
      "- Governing law, forum, and any escalation or ADR steps",
      "",
      "Produce this as a Word document via generate_docx — a heading per section above, with paragraphs beneath. Return the download link rather than pasting the full text inline.",
    ].join("\n"),
  },
  {
    title: "Generate CP Checklist",
    type: "assistant",
    promptMd: [
      "## Conditions Precedent Checklist",
      "",
      "Read the attached financing document and pull every condition precedent into a checklist. Deliver it only as a Word document via the generate_docx tool — do not print it in the chat. Return the download link.",
      "",
      "Lay the document out like this:",
      "- Group the conditions by category (for example Corporate, Finance, Legal Opinions, Security, Other). Add a heading block for each category.",
      "- Beneath each heading, add a single table block. Its first row is the header and must read, in order: No. | Clause Ref | Condition | Status.",
      "  - No. — runs 1, 2, 3… and restarts within each category",
      "  - Clause Ref — the clause or schedule the condition comes from",
      "  - Condition — a short description of what must be delivered or satisfied",
      "  - Status — leave empty for the user to complete",
      "",
      "Before you finish, confirm each table has those four columns in that order, every row has four cells, the No. column restarts at 1 per category, and no cell carries stray markdown, newlines or placeholder text (Status stays an empty string).",
    ].join("\n"),
  },
  {
    title: "NDA Review",
    type: "tabular",
    promptMd: "Extract key NDA terms across documents.",
    columnsConfig: [
      { index: 0, name: "Term", prompt: "What is the term/duration?" },
      { index: 1, name: "Governing Law", prompt: "What is the governing law?" },
      { index: 2, name: "Mutual?", prompt: "Is the NDA mutual or one-way?", format: "yes_no" },
    ],
  },
  {
    title: "Liability & Indemnity",
    type: "tabular",
    promptMd: "Extract liability and indemnity terms.",
    columnsConfig: [
      { index: 0, name: "Liability Cap", prompt: "What is the limitation of liability / cap?" },
      { index: 1, name: "Indemnity", prompt: "Summarize the indemnification obligations." },
    ],
  },
  {
    title: "NDA Playbook",
    type: "playbook",
    promptMd: "Review an inbound NDA against standard positions.",
    // System playbooks ship approved (curated), unlike user drafts.
    status: "approved",
    rules: [
      {
        id: "mutuality",
        clauseType: "Mutuality",
        standardPosition:
          "The NDA is mutual: both parties' confidential information is protected on equal terms.",
        unacceptable: "One-way obligations where only our disclosures are unprotected.",
        guidance: "One-way is acceptable only when we receive and never disclose.",
        severity: "red",
      },
      {
        id: "term",
        clauseType: "Confidentiality term",
        standardPosition: "Confidentiality obligations last 3 years from disclosure.",
        fallbacks: ["5 years from disclosure", "Perpetual for trade secrets only"],
        unacceptable: "Perpetual confidentiality for all information.",
        severity: "yellow",
      },
      {
        id: "carveouts",
        clauseType: "Standard carve-outs",
        standardPosition:
          "Excludes information that is public, already known, independently developed, or rightfully received from a third party; compelled disclosure permitted with notice.",
        unacceptable: "Missing independent-development or compelled-disclosure carve-outs.",
        severity: "red",
      },
      {
        id: "residuals",
        clauseType: "Residuals clause",
        standardPosition: "No residuals clause (no right to use retained mental impressions).",
        fallbacks: ["Residuals limited to general know-how, excluding technical data"],
        unacceptable: "Broad residuals clause covering technical information.",
        severity: "yellow",
      },
      {
        id: "remedies",
        clauseType: "Remedies",
        standardPosition: "Injunctive relief available; no liquidated damages.",
        unacceptable: "Liquidated damages or penalties for breach.",
        severity: "yellow",
      },
    ],
  },
];

/** Idempotently seed the system workflow templates. */
export async function seedBuiltinWorkflows() {
  for (const b of BUILTINS) {
    const existing = await db.select().from(workflows).where(eq(workflows.title, b.title));
    if (existing.some((w) => w.isSystem)) continue;
    await db.insert(workflows).values({
      title: b.title,
      type: b.type,
      promptMd: b.promptMd,
      columnsConfig: b.columnsConfig ?? null,
      rules: b.rules ?? null,
      isSystem: true,
    });
  }
}
