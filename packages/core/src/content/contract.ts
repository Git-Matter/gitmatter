import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db/client";
import { commits, contractEdits, contractVersions, contracts } from "@workspace/db/schema";
import { type Actor, recordCommit } from "../core/commit.js";
import {
  applyTrackedEdits,
  extractDocxBodyText,
  resolveTrackedChange,
} from "./docx/trackedChanges.js";
import { getObject, putObject } from "../core/storage.js";

export async function createContract(
  actor: Actor,
  input: { title: string; body: string; jurisdiction?: string | null }
) {
  const contractId = randomUUID();
  await recordCommit({
    artifactType: "contract",
    artifactId: contractId,
    actor,
    op: "create",
    message: `Created contract "${input.title}"`,
    apply: async ({ tx }) => {
      await tx.insert(contracts).values({
        id: contractId,
        userId: actor.userId,
        createdBy: actor.userId,
        title: input.title,
        body: input.body,
        jurisdiction: input.jurisdiction ?? null,
      });
      return {
        changes: [
          { path: "meta/title", before: null, after: input.title },
          { path: "body", before: null, after: input.body },
        ],
      };
    },
  });
  return contractId;
}

// --- DOCX redline support -------------------------------------------------
// A contract is in "docx mode" when it has a currentVersionId. Edits then run
// through the OOXML tracked-changes engine (real Word w:ins/w:del); each
// propose/resolve writes a new immutable contract version to storage.

async function latestVersion(contractId: string) {
  const [v] = await db
    .select()
    .from(contractVersions)
    .where(eq(contractVersions.contractId, contractId))
    .orderBy(desc(contractVersions.versionNumber))
    .limit(1);
  return v ?? null;
}

async function loadDocxBytes(storagePath: string): Promise<Buffer> {
  return Buffer.from(await getObject(storagePath));
}

/** Create a contract from an uploaded DOCX. Stores v1 bytes + extracted body text. */
export async function createContractFromDocx(
  actor: Actor,
  input: { title: string; bytes: Buffer; jurisdiction?: string | null }
) {
  const contractId = randomUUID();
  const body = await extractDocxBodyText(input.bytes);
  const storagePath = `contracts/${contractId}/v1.docx`;
  await putObject(storagePath, input.bytes);
  await recordCommit({
    artifactType: "contract",
    artifactId: contractId,
    actor,
    op: "create",
    message: `Uploaded contract "${input.title}"`,
    apply: async ({ tx }) => {
      // Insert the contract first; contract_versions.contract_id FKs to it.
      await tx.insert(contracts).values({
        id: contractId,
        userId: actor.userId,
        createdBy: actor.userId,
        title: input.title,
        body,
        jurisdiction: input.jurisdiction ?? null,
      });
      const [v] = await tx
        .insert(contractVersions)
        .values({ contractId, versionNumber: 1, storagePath, source: "upload" })
        .returning();
      await tx
        .update(contracts)
        .set({ currentVersionId: v!.id })
        .where(eq(contracts.id, contractId));
      return {
        changes: [
          { path: "meta/title", before: null, after: input.title },
          { path: "body", before: null, after: body },
          { path: "version", before: null, after: 1 },
        ],
      };
    },
  });
  return contractId;
}

async function proposeDocxEdit(
  actor: Actor,
  contract: typeof contracts.$inferSelect,
  input: { find: string; replace: string; reason?: string }
) {
  const v = await latestVersion(contract.id);
  if (!v) throw new Error("Contract has no document version");
  const result = await applyTrackedEdits(
    await loadDocxBytes(v.storagePath),
    [
      {
        find: input.find,
        replace: input.replace,
        context_before: "",
        context_after: "",
        reason: input.reason,
      },
    ],
    { author: actor.userId }
  );
  const applied = result.changes[0];
  if (!applied)
    throw new Error(result.errors[0]?.reason ?? "edit could not be applied to the document");

  const versionNumber = v.versionNumber + 1;
  const storagePath = `contracts/${contract.id}/v${versionNumber}.docx`;
  await putObject(storagePath, result.bytes);
  const newBody = await extractDocxBodyText(result.bytes);

  await recordCommit({
    artifactType: "contract",
    artifactId: contract.id,
    actor,
    op: "propose_edit",
    message: `Proposed edit: "${input.find.slice(0, 40)}" → "${input.replace.slice(0, 40)}"`,
    apply: async ({ tx, commitId }) => {
      const [nv] = await tx
        .insert(contractVersions)
        .values({ contractId: contract.id, versionNumber, storagePath, source: "edit" })
        .returning();
      await tx.insert(contractEdits).values({
        contractId: contract.id,
        versionId: nv!.id,
        changeId: applied.id,
        delWId: applied.delId ?? null,
        insWId: applied.insId ?? null,
        deletedText: applied.deletedText,
        insertedText: applied.insertedText,
        contextBefore: applied.contextBefore,
        contextAfter: applied.contextAfter,
        reason: input.reason ?? null,
        status: "pending",
        createdBy: actor.userId,
        lastCommitId: commitId,
      });
      await tx
        .update(contracts)
        .set({ body: newBody, currentVersionId: nv!.id, updatedAt: new Date() })
        .where(eq(contracts.id, contract.id));
      return {
        changes: [
          {
            path: `edit/${applied.id}`,
            before: null,
            after: {
              find: input.find,
              replace: input.replace,
              reason: input.reason ?? null,
              status: "pending",
            },
          },
          { path: "version", before: v.versionNumber, after: versionNumber },
        ],
      };
    },
  });
  return applied.id;
}

async function resolveDocxEdit(
  actor: Actor,
  contract: typeof contracts.$inferSelect,
  edit: typeof contractEdits.$inferSelect,
  decision: "accept" | "reject"
) {
  const v = await latestVersion(contract.id);
  if (!v) throw new Error("Contract has no document version");
  const wIds = [edit.delWId, edit.insWId].filter((x): x is string => !!x);
  const { bytes: newBytes } = await resolveTrackedChange(
    await loadDocxBytes(v.storagePath),
    wIds,
    decision
  );
  const versionNumber = v.versionNumber + 1;
  const storagePath = `contracts/${contract.id}/v${versionNumber}.docx`;
  await putObject(storagePath, newBytes);
  const newBody = await extractDocxBodyText(newBytes);
  const status = decision === "accept" ? "accepted" : "rejected";

  return recordCommit({
    artifactType: "contract",
    artifactId: contract.id,
    actor,
    op: "resolve_edit",
    message: `${status} edit ${edit.changeId.slice(0, 8)}`,
    apply: async ({ tx, commitId }) => {
      const [nv] = await tx
        .insert(contractVersions)
        .values({ contractId: contract.id, versionNumber, storagePath, source: "edit" })
        .returning();
      await tx
        .update(contractEdits)
        .set({ status, resolvedBy: actor.userId, resolvedAt: new Date(), lastCommitId: commitId })
        .where(eq(contractEdits.id, edit.id));
      await tx
        .update(contracts)
        .set({ body: newBody, currentVersionId: nv!.id, updatedAt: new Date() })
        .where(eq(contracts.id, contract.id));
      return {
        changes: [
          { path: `edit/${edit.changeId}/status`, before: "pending", after: status },
          { path: "body", before: contract.body, after: newBody },
          { path: "version", before: v.versionNumber, after: versionNumber },
        ],
      };
    },
  });
}

/** Propose a tracked change (find -> replace). Stored as a pending edit; body unchanged. */
export async function proposeEdit(
  actor: Actor,
  contractId: string,
  input: { find: string; replace: string; reason?: string }
) {
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, contractId));
  if (!contract) throw new Error("Contract not found");
  if (contract.currentVersionId) return proposeDocxEdit(actor, contract, input);
  if (!contract.body.includes(input.find)) {
    throw new Error("`find` text not present in the contract");
  }
  const changeId = randomUUID();
  await recordCommit({
    artifactType: "contract",
    artifactId: contractId,
    actor,
    op: "propose_edit",
    message: `Proposed edit: "${input.find.slice(0, 40)}" → "${input.replace.slice(0, 40)}"`,
    apply: async ({ tx, commitId }) => {
      await tx.insert(contractEdits).values({
        contractId,
        changeId,
        deletedText: input.find,
        insertedText: input.replace,
        reason: input.reason ?? null,
        status: "pending",
        createdBy: actor.userId,
        lastCommitId: commitId,
      });
      return {
        changes: [
          {
            path: `edit/${changeId}`,
            before: null,
            after: {
              find: input.find,
              replace: input.replace,
              reason: input.reason ?? null,
              status: "pending",
            },
          },
        ],
      };
    },
  });
  return changeId;
}

/** Accept (apply find->replace to body) or reject a tracked change. */
export async function resolveEdit(
  actor: Actor,
  contractId: string,
  changeId: string,
  decision: "accept" | "reject"
) {
  const [edit] = await db
    .select()
    .from(contractEdits)
    .where(and(eq(contractEdits.contractId, contractId), eq(contractEdits.changeId, changeId)));
  if (!edit) throw new Error("Edit not found");
  if (edit.status !== "pending") throw new Error("Edit already resolved");

  const [contract] = await db.select().from(contracts).where(eq(contracts.id, contractId));
  if (!contract) throw new Error("Contract not found");

  if (contract.currentVersionId) return resolveDocxEdit(actor, contract, edit, decision);

  const status = decision === "accept" ? "accepted" : "rejected";

  return recordCommit({
    artifactType: "contract",
    artifactId: contractId,
    actor,
    op: "resolve_edit",
    message: `${status} edit ${changeId.slice(0, 8)}`,
    apply: async ({ tx, commitId }) => {
      await tx
        .update(contractEdits)
        .set({ status, resolvedBy: actor.userId, resolvedAt: new Date(), lastCommitId: commitId })
        .where(eq(contractEdits.id, edit.id));

      const changes: Array<{ path: string; before: unknown; after: unknown }> = [
        { path: `edit/${changeId}/status`, before: "pending", after: status },
      ];

      if (decision === "accept" && edit.deletedText !== null) {
        const newBody = contract.body.replace(edit.deletedText, edit.insertedText ?? "");
        await tx
          .update(contracts)
          .set({ body: newBody, updatedAt: new Date() })
          .where(eq(contracts.id, contractId));
        changes.push({ path: "body", before: contract.body, after: newBody });
      }
      return { changes };
    },
  });
}

/** Latest DOCX bytes for a contract (the current tracked-changes version), or null. */
export async function getContractDocx(contractId: string): Promise<Buffer | null> {
  const v = await latestVersion(contractId);
  if (!v) return null;
  return loadDocxBytes(v.storagePath);
}

export async function listContracts(userId: string) {
  return db.select().from(contracts).where(eq(contracts.userId, userId));
}

/** Contract with its edits and per-edit blame (commit that last touched each edit). */
export async function getContract(contractId: string) {
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, contractId));
  if (!contract) return null;

  const edits = await db
    .select()
    .from(contractEdits)
    .where(eq(contractEdits.contractId, contractId))
    .orderBy(asc(contractEdits.createdAt));

  const commitIds = [...new Set(edits.map((e) => e.lastCommitId).filter((x): x is string => !!x))];
  const blameRows = commitIds.length
    ? await db.select().from(commits).where(inArray(commits.id, commitIds))
    : [];
  const blameById = new Map(blameRows.map((b) => [b.id, b]));

  return {
    contract,
    edits: edits.map((e) => ({
      ...e,
      blame: e.lastCommitId ? (blameById.get(e.lastCommitId) ?? null) : null,
    })),
  };
}
