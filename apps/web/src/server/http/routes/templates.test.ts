import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, test } from "vite-plus/test";
import { Hono } from "hono";
import { eq, inArray } from "drizzle-orm";
import { db, sql } from "@workspace/db/client";
import { commits, tenants, user } from "@workspace/db/schema";
import { extractMarkdown } from "@workspace/core";
import { templatesRoute } from "./templates.js";
import type { AuthedUser, AuthEnv } from "../middleware/auth.js";

const suffix = randomUUID();
let tenantId: string;
let id: string;
let acting: AuthedUser;
let admin: AuthedUser;
let sales: AuthedUser;
const app = new Hono<AuthEnv>();
// Isolate the routes with a trusted test identity; production session middleware
// is deliberately outside this route/Word round-trip integration test.
app.use("*", async (c, next) => {
  c.set("user", acting);
  await next();
});
app.route("/", templatesRoute);
const content = {
  title: "HTTP NDA",
  category: "Commercial",
  body: "Exact approved terms.",
  guidance: "Use this NDA",
  audience: "workspace",
};
async function row() {
  const response = await app.request(`/api/templates/${id}`);
  return response.json();
}
async function action(action: string, expected?: string) {
  const current = await row();
  return app.request(`/api/templates/${id}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      expectedHead: expected ?? current.headCommitId,
      revisionId: current.draft.id,
      action,
      message: `HTTP ${action}`,
      reviewerId: admin.id,
    }),
  });
}
beforeAll(async () => {
  const [tenant] = await db
    .insert(tenants)
    .values({ name: `Template HTTP ${suffix}` })
    .returning();
  tenantId = tenant.id;
  admin = {
    id: `template-http-admin-${suffix}`,
    email: `admin-${suffix}@example.com`,
    name: "Legal Admin",
    tenantId,
    tenantRole: "admin",
  };
  sales = {
    ...admin,
    id: `template-http-sales-${suffix}`,
    email: `sales-${suffix}@example.com`,
    name: "Sales",
    tenantRole: "member",
  };
  await db.insert(user).values([admin, sales].map((u) => ({ ...u, emailVerified: true })));
  acting = admin;
});
afterAll(async () => {
  if (id) await db.delete(commits).where(eq(commits.artifactId, id));
  if (tenantId) await db.delete(tenants).where(eq(tenants.id, tenantId));
  if (admin) await db.delete(user).where(inArray(user.id, [admin.id, sales.id]));
  await sql.end();
});
test("validation, exact approval, current DOCX bytes, access denial and conflicts over HTTP", async () => {
  expect((await app.request("/api/templates/invalid/download")).status).toBe(400);
  const invalid = await app.request("/api/templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...content, title: " " }),
  });
  expect(invalid.status).toBe(400);
  const invalidUpload = new FormData();
  invalidUpload.set("content", JSON.stringify({ ...content, body: "" }));
  invalidUpload.set("file", new File(["Not a Word file"], "invalid.docx"));
  expect(
    (await app.request("/api/templates/upload", { method: "POST", body: invalidUpload })).status
  ).toBe(400);
  const created = await app.request("/api/templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(content),
  });
  expect(created.status).toBe(201);
  id = (await created.json()).id;
  const listed = await app.request("/api/templates?limit=1");
  const page = await listed.json();
  expect(page.items).toHaveLength(1);
  expect(page.items[0].draft).not.toHaveProperty("body");
  expect(page.items[0].draft).not.toHaveProperty("guidance");
  expect((await app.request("/api/templates?limit=101")).status).toBe(400);
  const staleHead = (await row()).headCommitId;
  expect((await action("submit")).status).toBe(200);
  expect((await action("publish", staleHead)).status).toBe(409);
  expect((await action("publish")).status).toBe(200);
  acting = sales;
  const published = await row();
  expect(published.current.body).toBe(content.body);
  expect((await app.request(`/api/templates/${randomUUID()}`)).status).toBe(404);
  expect(published.draft).toBeNull();
  expect((await app.request(`/api/templates/${id}/history`)).status).toBe(403);
  const downloaded = await app.request(`/api/templates/${id}/download`);
  expect(downloaded.status).toBe(200);
  expect(downloaded.headers.get("Cache-Control")).toBe("no-store");
  expect(downloaded.headers.get("Content-Disposition")).toContain("HTTP-NDA-v1.docx");
  expect(downloaded.headers.get("X-Template-Revision")).toBe(published.current.id);
  const bytes = Buffer.from(await downloaded.arrayBuffer());
  const extracted = await extractMarkdown(bytes, "docx");
  expect(extracted.markdown).toContain(content.body);
  acting = admin;
  expect((await action("archive")).status).toBe(200);
  acting = sales;
  expect((await app.request(`/api/templates/${id}/download`)).status).toBe(404);
});
