import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db/client";
import { commits, workflows } from "@workspace/db/schema";
import type { TabularColumn } from "@workspace/db/schema";
import { type Actor, recordCommit } from "../core/commit.js";

type WorkflowInput = {
  title: string;
  type: "assistant" | "tabular";
  promptMd: string;
  columnsConfig?: TabularColumn[];
};

export async function createWorkflow(actor: Actor, input: WorkflowInput) {
  const workflowId = randomUUID();
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
        "field/columns_config": commitId,
      };
      await tx.insert(workflows).values({
        id: workflowId,
        userId: actor.userId,
        createdBy: actor.userId,
        title: input.title,
        type: input.type,
        promptMd: input.promptMd,
        columnsConfig: input.columnsConfig ?? null,
        fieldCommits,
      });
      return {
        changes: [
          { path: "field/title", before: null, after: input.title },
          { path: "field/type", before: null, after: input.type },
          { path: "field/prompt_md", before: null, after: input.promptMd },
          { path: "field/columns_config", before: null, after: input.columnsConfig ?? null },
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
  if (patch.columnsConfig !== undefined)
    fields.push({
      key: "field/columns_config",
      col: "columnsConfig",
      before: wf.columnsConfig,
      after: patch.columnsConfig,
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

export async function listWorkflows(userId: string) {
  // System workflows + the user's own.
  const rows = await db.select().from(workflows);
  return rows.filter((w) => w.isSystem || w.userId === userId);
}

export async function getWorkflow(workflowId: string) {
  const [wf] = await db.select().from(workflows).where(eq(workflows.id, workflowId));
  if (!wf) return null;
  const commitIds = [...new Set(Object.values(wf.fieldCommits ?? {}))];
  const blameRows = commitIds.length
    ? await db.select().from(commits).where(inArray(commits.id, commitIds))
    : [];
  const blameById = new Map(blameRows.map((b) => [b.id, b]));
  const blame: Record<string, unknown> = {};
  for (const [field, cid] of Object.entries(wf.fieldCommits ?? {})) {
    blame[field] = blameById.get(cid) ?? null;
  }
  return { workflow: wf, blame };
}

const BUILTINS: WorkflowInput[] = [
  {
    title: "Contract Summary",
    type: "assistant",
    promptMd:
      "Summarize this contract: parties, term, key obligations, termination, governing law, and any unusual or risky clauses.",
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
      isSystem: true,
    });
  }
}
