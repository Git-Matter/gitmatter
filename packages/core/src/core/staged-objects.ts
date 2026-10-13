import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db, type Tx } from "@workspace/db/client";
import { auditEvents, documents, documentVersions, stagedObjects } from "@workspace/db/schema";
import { putObject, deleteObject, isAlreadyDeleted } from "./storage.js";
import { StorageQuotaError, tenantStorageQuotaBytes } from "../platform/usage.js";
import { getEnvNumber } from "./config.js";

/** Persist the immutable write intent before I/O, including bytes that never get published. */
export async function putStagedObject(
  tenantId: string,
  key: string,
  body: Buffer | Uint8Array,
  contentType?: string
) {
  if (!key.startsWith(`${tenantId}/`) || !Number.isSafeInteger(body.length))
    throw new Error("Invalid staged object");
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`storage-reservation:${tenantId}`}))`
    );
    const [referenced] = await tx
      .select({ total: sql<number>`coalesce(sum(${documentVersions.sizeBytes}),0)` })
      .from(documentVersions)
      .innerJoin(documents, eq(documents.id, documentVersions.documentId))
      .where(and(eq(documents.tenantId, tenantId), isNotNull(documentVersions.storagePath)));
    const [unpublished] = await tx
      .select({ total: sql<number>`coalesce(sum(${stagedObjects.sizeBytes}),0)` })
      .from(stagedObjects)
      .where(
        and(
          eq(stagedObjects.tenantId, tenantId),
          sql`${stagedObjects.state} in ('staged','deleting')`
        )
      );
    const used = Number(referenced?.total ?? 0) + Number(unpublished?.total ?? 0);
    const limit = tenantStorageQuotaBytes();
    if (limit > 0 && used + body.length > limit)
      throw new StorageQuotaError(used, body.length, limit);
    await tx.insert(stagedObjects).values({
      tenantId,
      storagePath: key,
      sizeBytes: body.length,
      expiresAt: sql`now() + interval '2 hours'`,
    });
  });
  // A failed/ambiguous object write remains reserved until reconciliation proves it unpublished.
  const controller = new AbortController();
  const deadline = setTimeout(
    () => controller.abort(),
    Math.max(1000, Math.min(600_000, getEnvNumber("STORAGE_WRITE_TIMEOUT_MS", 120_000)))
  );
  deadline.unref();
  try {
    await putObject(tenantId, key, Buffer.isBuffer(body) ? body : Buffer.from(body), contentType, {
      signal: controller.signal,
    });
  } finally {
    clearTimeout(deadline);
  }
  const ownership = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`storage-reservation:${tenantId}`}))`
    );
    const [current] = await tx
      .select()
      .from(stagedObjects)
      .where(and(eq(stagedObjects.tenantId, tenantId), eq(stagedObjects.storagePath, key)))
      .for("update");
    if (!current) throw new Error("stale_source");
    if (current.state === "staged") {
      await tx
        .update(stagedObjects)
        .set({ expiresAt: sql`now() + interval '2 hours'`, updatedAt: sql`now()` })
        .where(eq(stagedObjects.id, current.id));
      return { live: true, claim: null };
    }
    const [reference] = await tx
      .select({ id: documentVersions.id })
      .from(documentVersions)
      .where(eq(documentVersions.storagePath, key))
      .limit(1);
    if (current.state === "attached" || reference) return { live: false, claim: null };
    const [claim] = await tx
      .update(stagedObjects)
      .set({
        state: "deleting",
        expiresAt: sql`now()`,
        updatedAt: sql`now()`,
        revision: sql`${stagedObjects.revision} + 1`,
      })
      .where(eq(stagedObjects.id, current.id))
      .returning();
    return { live: false, claim: claim ?? null };
  });
  if (!ownership.live) {
    if (ownership.claim) await deleteClaimedObject(ownership.claim).catch(() => {});
    throw new Error("stale_source");
  }
}

/** Must share the version publication transaction; expired or deleting bytes cannot be attached. */
export async function attachStagedObject(tx: Tx, tenantId: string, key: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`storage-reservation:${tenantId}`}))`
  );
  const rows = await tx
    .update(stagedObjects)
    .set({ state: "attached", updatedAt: sql`now()` })
    .where(
      and(
        eq(stagedObjects.tenantId, tenantId),
        eq(stagedObjects.storagePath, key),
        eq(stagedObjects.state, "staged"),
        sql`${stagedObjects.expiresAt} > now()`
      )
    )
    .returning({ id: stagedObjects.id });
  if (rows.length !== 1) throw new Error("stale_source");
}

/** Reclaims only recorded unpublished intents; it never enumerates/deletes arbitrary bucket keys. */
export async function reconcileStagedObjects(
  limit = 20,
  tenantId?: string
): Promise<{ deleted: number; retained: number; failed: number }> {
  const rows = await db
    .select()
    .from(stagedObjects)
    .where(
      and(
        sql`${stagedObjects.state} in ('staged','deleting') and ${stagedObjects.expiresAt} <= now()`,
        tenantId ? eq(stagedObjects.tenantId, tenantId) : undefined
      )
    )
    .limit(Math.max(1, Math.min(100, limit)));
  const result = { deleted: 0, retained: 0, failed: 0 };
  for (const row of rows) {
    const deletable = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`storage-reservation:${row.tenantId}`}))`
      );
      const [current] = await tx
        .select()
        .from(stagedObjects)
        .where(
          and(
            eq(stagedObjects.id, row.id),
            sql`${stagedObjects.state} in ('staged','deleting') and ${stagedObjects.expiresAt} <= now()`
          )
        )
        .for("update");
      if (!current) return null;
      const [reference] = await tx
        .select({ id: documentVersions.id })
        .from(documentVersions)
        .where(eq(documentVersions.storagePath, current.storagePath))
        .limit(1);
      if (reference) {
        await tx
          .update(stagedObjects)
          .set({ state: "attached", updatedAt: sql`now()` })
          .where(eq(stagedObjects.id, row.id));
        return null;
      }
      const [claim] = await tx
        .update(stagedObjects)
        .set({
          state: "deleting",
          updatedAt: sql`now()`,
          revision: sql`${stagedObjects.revision} + 1`,
        })
        .where(eq(stagedObjects.id, row.id))
        .returning();
      return claim ?? null;
    });
    if (!deletable) {
      result.retained++;
      continue;
    }
    try {
      await deleteClaimedObject(deletable);
      result.deleted++;
    } catch {
      result.failed++;
    }
  }
  return result;
}

async function deleteClaimedObject(claim: typeof stagedObjects.$inferSelect) {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 60_000);
  deadline.unref();
  try {
    await deleteObject(claim.tenantId, claim.storagePath, { signal: controller.signal });
  } catch (error) {
    if (!isAlreadyDeleted(error)) throw error;
  } finally {
    clearTimeout(deadline);
  }
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(stagedObjects)
      .set({ state: "deleted", updatedAt: sql`now()` })
      .where(
        and(
          eq(stagedObjects.id, claim.id),
          eq(stagedObjects.state, "deleting"),
          eq(stagedObjects.revision, claim.revision)
        )
      )
      .returning({ id: stagedObjects.id });
    if (updated.length)
      await tx.insert(auditEvents).values({
        tenantId: claim.tenantId,
        eventType: "storage.orphan_deleted",
        target: claim.id,
        metadata: { sizeBytes: claim.sizeBytes, revision: claim.revision },
      });
  });
}
