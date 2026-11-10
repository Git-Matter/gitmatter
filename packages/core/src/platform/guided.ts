import { createHash } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@workspace/db/client";
import { clients, documents, matterDocuments, matters, user } from "@workspace/db/schema";
import {
  buildGuidedPrompt,
  FICTIONAL_SAMPLE_DOCUMENTS,
  JURISDICTIONS,
  type GuidedSample,
  type GuidedTaskInput,
  type PreparedGuidedTask,
} from "@workspace/registry";
import {
  canReadDocument,
  getUserTenant,
  hasClientAccess,
  hasMatterAccess,
} from "../core/access.js";
import { recordCommit } from "../core/commit.js";
import { createClient, createMatter } from "./matters.js";
import { recordAudit } from "./audit.js";
import { getPracticeProfile } from "./practice-profile.js";

export class GuidedTaskError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 409 = 400
  ) {
    super(message);
  }
}

/** Stable, per-user fixture identities make partial sample creation resumable. */
function sampleId(userId: string, tenantId: string, kind: string): string {
  const bytes = createHash("sha256")
    .update(`gitmatter:fictional-sample:v1:${tenantId}:${userId}:${kind}`)
    .digest();
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function ensureGuidedSample(userId: string): Promise<GuidedSample> {
  const tenantId = await getUserTenant(userId);
  if (!tenantId) throw new GuidedTaskError("Practice not found", 403);
  return db.transaction(async (tx) => {
    // All helpers reuse this connection. Duplicate clicks fail fast; distinct
    // users can queue at the pool without reserving nested connections.
    const locked = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtext(${`guided-sample:${tenantId}:${userId}`})) as locked`
    );
    if (!locked[0]?.locked)
      throw new GuidedTaskError(
        "Your fictional sample is being prepared. Please try again shortly.",
        409
      );

    const [account] = await tx
      .select({ tenantId: user.tenantId })
      .from(user)
      .where(eq(user.id, userId))
      .for("share");
    if (account?.tenantId !== tenantId)
      throw new GuidedTaskError(
        "Practice changed while preparing the sample. Please try again.",
        409
      );

    const clientId = sampleId(userId, tenantId, "client");
    const matterId = sampleId(userId, tenantId, "matter");
    const [client] = await tx.select().from(clients).where(eq(clients.id, clientId));
    if (client && !(await hasClientAccess(userId, clientId, "editor", tx)))
      throw new GuidedTaskError("The sample is no longer accessible to your account", 403);
    if (!client) {
      await createClient(
        userId,
        tenantId,
        {
          id: clientId,
          name: "Fictional sample — Harbour Studio",
        },
        tx
      );
    }
    const [matter] = await tx.select().from(matters).where(eq(matters.id, matterId));
    if (matter && !(await hasMatterAccess(userId, matterId, "editor", tx)))
      throw new GuidedTaskError("The sample is no longer accessible to your account", 403);
    if (!matter) {
      await createMatter(
        userId,
        {
          id: matterId,
          clientId,
          name: "Fictional sample — website agreement",
          practiceArea: "General Practice",
          jurisdiction: "AU-NSW",
        },
        tx
      );
    }

    const documentIds: string[] = [];
    for (const [index, fixture] of FICTIONAL_SAMPLE_DOCUMENTS.entries()) {
      const id = sampleId(userId, tenantId, `document:${index}`);
      const [existing] = await tx.select().from(documents).where(eq(documents.id, id));
      if (existing) {
        if (existing.deletedAt || !(await canReadDocument(userId, id, tx)))
          throw new GuidedTaskError(
            "A sample document was removed or is no longer accessible. Use your own matter instead.",
            409
          );
      } else {
        await recordCommit(
          {
            artifactType: "document",
            artifactId: id,
            actor: { type: "user", userId },
            op: "create",
            message: "Created fictional guided sample source",
            apply: async ({ tx: commitTx }) => {
              await commitTx.insert(documents).values({
                id,
                userId,
                tenantId,
                matterId,
                title: fixture.title,
                markdown: fixture.markdown,
                fileType: "text/markdown",
                status: "ready",
                jurisdiction: "AU-NSW",
                sizeBytes: Buffer.byteLength(fixture.markdown),
              });
              await commitTx.insert(matterDocuments).values({ matterId, documentId: id });
              return {
                changes: [
                  { path: "field/title", before: null, after: fixture.title },
                  { path: "field/markdown", before: null, after: fixture.markdown },
                  { path: "field/matter_id", before: null, after: matterId },
                ],
              };
            },
          },
          tx
        );
      }
      documentIds.push(id);
    }
    await recordAudit(
      {
        eventType: "guided.sample_opened",
        actorId: userId,
        tenantId,
        target: matterId,
        metadata: { sampleVersion: 1, sourceCount: documentIds.length },
      },
      tx
    );
    return { matterId, documentIds };
  });
}

/** Authorise the complete selection; never silently remove a forbidden source. */
export async function prepareGuidedTask(
  userId: string,
  input: GuidedTaskInput
): Promise<PreparedGuidedTask> {
  if (!(await hasMatterAccess(userId, input.matterId, "editor")))
    throw new GuidedTaskError("Matter not found or not editable", 403);
  const [matter] = await db.select().from(matters).where(eq(matters.id, input.matterId));
  if (!matter || matter.status !== "open") throw new GuidedTaskError("Choose an open matter");
  if (!JURISDICTIONS.some((item) => item.code === input.jurisdiction && item.code.startsWith("AU")))
    throw new GuidedTaskError("Choose an Australian jurisdiction");
  if (
    !input.documentIds.length ||
    input.documentIds.length > 25 ||
    new Set(input.documentIds).size !== input.documentIds.length
  )
    throw new GuidedTaskError("Choose between 1 and 25 distinct source documents");

  const sources = await db
    .select()
    .from(documents)
    .where(and(inArray(documents.id, input.documentIds), isNull(documents.deletedAt)));
  const links = await db
    .select({ documentId: matterDocuments.documentId })
    .from(matterDocuments)
    .where(
      and(
        eq(matterDocuments.matterId, input.matterId),
        inArray(matterDocuments.documentId, input.documentIds)
      )
    );
  const linkedIds = new Set(links.map((link) => link.documentId));
  for (const id of input.documentIds) {
    const source = sources.find((doc) => doc.id === id);
    if (
      !source ||
      !(await canReadDocument(userId, id)) ||
      (source.matterId !== input.matterId && !linkedIds.has(id))
    )
      throw new GuidedTaskError(
        "One or more selected documents are not available in this matter",
        403
      );
    if (source.status !== "ready" || source.staged || !source.markdown?.trim())
      throw new GuidedTaskError("Every source document must be ready and contain extracted text");
  }
  const ordered = input.documentIds.map((id) => sources.find((doc) => doc.id === id)!);
  const { profile } = await getPracticeProfile(userId);
  return {
    version: 1,
    task: input.task,
    matterId: input.matterId,
    jurisdiction: input.jurisdiction,
    prompt: buildGuidedPrompt({ ...input, documents: ordered, practice: profile }),
    attachments: ordered.map((doc) => ({
      kind: "document",
      id: doc.id,
      label: doc.title,
      fileType: doc.fileType,
      status: "ready",
    })),
  };
}
