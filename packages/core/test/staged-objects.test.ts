import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test, vi } from "vite-plus/test";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db/client";
import { documents, documentVersions, stagedObjects, tenants, user } from "@workspace/db/schema";
import {
  putStagedObject,
  attachStagedObject,
  reconcileStagedObjects,
} from "../src/core/staged-objects.js";
import { putObject, deleteObject } from "../src/core/storage.js";

vi.mock("../src/core/storage.js", () => ({
  putObject: vi.fn(async () => {}),
  deleteObject: vi.fn(async () => {}),
  isAlreadyDeleted: () => false,
}));
const userId = `staged-storage-${randomUUID()}`;
let tenantId: string;
const key = () => `${tenantId}/${userId}/${randomUUID()}.docx`;
describe("unpublished object reconciliation (real Postgres, synthetic object I/O)", () => {
  beforeAll(async () => {
    const [tenant] = await db
      .insert(tenants)
      .values({ name: "Staging tests", storageRegion: "legacy" })
      .returning();
    tenantId = tenant!.id;
    await db
      .insert(user)
      .values({ id: userId, name: "Storage", email: `${userId}@example.com`, tenantId });
  });
  afterAll(async () => {
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db.delete(user).where(eq(user.id, userId));
  });
  test("immutable key reuse fails before writing and attached historical versions survive reconciliation", async () => {
    const path = key();
    await putStagedObject(tenantId, path, Buffer.from("source"));
    const writes = vi.mocked(putObject).mock.calls.length;
    await expect(putStagedObject(tenantId, path, Buffer.from("overwrite"))).rejects.toThrow();
    expect(vi.mocked(putObject).mock.calls.length).toBe(writes);
    const [doc] = await db
      .insert(documents)
      .values({ tenantId, userId, title: "History", fileType: "docx" })
      .returning();
    await db.transaction(async (tx) => {
      await tx.insert(documentVersions).values({
        documentId: doc!.id,
        versionNumber: 1,
        source: "upload",
        fileType: "docx",
        storagePath: path,
      });
      await attachStagedObject(tx, tenantId, path);
    });
    await db
      .update(stagedObjects)
      .set({ state: "staged", expiresAt: sql`now() - interval '1 second'` })
      .where(eq(stagedObjects.storagePath, path));
    await reconcileStagedObjects(20, tenantId);
    expect(
      (await db.select().from(stagedObjects).where(eq(stagedObjects.storagePath, path)))[0]!.state
    ).toBe("attached");
    expect(vi.mocked(deleteObject).mock.calls.some((args) => args[1] === path)).toBe(false);
  });
  test("late PUT rearms a fenced cleanup retry when the first late deletion fails", async () => {
    const path = key();
    let finish!: () => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    vi.mocked(putObject).mockImplementationOnce(async () => {
      started();
      await pending;
    });
    const writing = putStagedObject(tenantId, path, Buffer.from("late"));
    await Promise.race([
      ready,
      writing.then(() => {
        throw new Error("Unexpected early write completion");
      }),
    ]);
    await db
      .update(stagedObjects)
      .set({ expiresAt: sql`now() - interval '1 second'` })
      .where(eq(stagedObjects.storagePath, path));
    await reconcileStagedObjects(20, tenantId);
    const [first] = await db
      .select()
      .from(stagedObjects)
      .where(eq(stagedObjects.storagePath, path));
    expect(first!.state).toBe("deleted");
    vi.mocked(deleteObject).mockRejectedValueOnce(new Error("Synthetic late delete failure"));
    finish();
    await expect(writing).rejects.toThrow("stale_source");
    const [retry] = await db
      .select()
      .from(stagedObjects)
      .where(eq(stagedObjects.storagePath, path));
    expect(retry!.state).toBe("deleting");
    expect(retry!.revision).toBeGreaterThan(first!.revision);
    await reconcileStagedObjects(20, tenantId);
    expect(
      (await db.select().from(stagedObjects).where(eq(stagedObjects.storagePath, path)))[0]!.state
    ).toBe("deleted");
  });

  test("crashed write intent retries deletion and cannot publish once reconciliation owns it", async () => {
    const path = key();
    await putStagedObject(tenantId, path, Buffer.from("unpublished"));
    await db
      .update(stagedObjects)
      .set({ expiresAt: sql`now() - interval '1 second'` })
      .where(eq(stagedObjects.storagePath, path));
    vi.mocked(deleteObject).mockRejectedValueOnce(new Error("Synthetic storage outage"));
    expect((await reconcileStagedObjects(20, tenantId)).failed).toBeGreaterThanOrEqual(1);
    await expect(db.transaction((tx) => attachStagedObject(tx, tenantId, path))).rejects.toThrow(
      "stale_source"
    );
    await reconcileStagedObjects(20, tenantId);
    expect(
      (
        await db
          .select()
          .from(stagedObjects)
          .where(and(eq(stagedObjects.tenantId, tenantId), eq(stagedObjects.storagePath, path)))
      )[0]!.state
    ).toBe("deleted");
  });
});
