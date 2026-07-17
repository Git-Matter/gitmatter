import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { db, sql } from "@workspace/db/client";
import { auditEvents, clients, matters, tenants, user } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { buildTenantExport } from "../src/platform/export.js";
import { buildTenantPrivacyEvidence } from "../src/platform/tenants.js";

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
  await db.update(tenants).set({ storageRegion: "eu" }).where(eq(tenants.id, tenantId));
  await db.insert(auditEvents).values({
    tenantId,
    actorId: userId,
    eventType: "tenant.storage_region_set",
    metadata: { region: "eu" },
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

  test("produces bounded evidence for the selected document-storage target", async () => {
    const evidence = await buildTenantPrivacyEvidence(tenantId);

    expect(evidence.tenant.storageRegion).toBe("eu");
    expect(evidence.routingControl.immutableAfterSelection).toBe(true);
    expect(evidence.routingControl.target.label).toBe("Cloudflare R2 EU jurisdiction");
    expect(evidence.routingControl.selectionAuditEvent?.metadata).toEqual({ region: "eu" });
    expect(evidence.scope).toContain("Document object storage only");
  });
});
