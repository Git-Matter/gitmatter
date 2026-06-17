import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { db, sql } from "@workspace/db/client";
import { clients, matters, tenants, user } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { buildTenantExport } from "../src/platform/export.js";

const userId = `test-user-${randomUUID()}`;
let tenantId: string;

beforeAll(async () => {
  const [t] = await db.insert(tenants).values({ name: "Export Test Tenant" }).returning();
  tenantId = t!.id;
  await db.insert(user).values({
    id: userId,
    name: "Export User",
    email: `${userId}@example.com`,
    emailVerified: true,
    tenantId,
  });
  const [client] = await db
    .insert(clients)
    .values({ tenantId, name: "Acme Corp", createdBy: userId })
    .returning();
  await db
    .insert(matters)
    .values({ tenantId, clientId: client!.id, name: "Acme v. Roadrunner", createdBy: userId });
});

afterAll(async () => {
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await db.delete(user).where(eq(user.id, userId));
  await sql.end();
});

describe("buildTenantExport", () => {
  test("produces a zip with the expected CSVs containing tenant data", async () => {
    const { filename, bytes } = await buildTenantExport(tenantId);
    expect(filename).toBe("tenant-export.zip");

    const zip = await JSZip.loadAsync(bytes);
    expect(zip.file("clients.csv")).toBeTruthy();
    expect(zip.file("matters.csv")).toBeTruthy();
    expect(zip.file("documents-manifest.csv")).toBeTruthy();
    expect(zip.file("reviews.csv")).toBeTruthy();

    const clientsCsv = await zip.file("clients.csv")!.async("string");
    expect(clientsCsv).toContain("Acme Corp");
    const mattersCsv = await zip.file("matters.csv")!.async("string");
    expect(mattersCsv).toContain("Acme v. Roadrunner");
  });
});
