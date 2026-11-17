import { createServer } from "node:http";
import { createRequire } from "node:module";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

if (process.env.ALLOW_LOCAL_TEMPLATE_ACCEPTANCE !== "1")
  throw new Error(
    "Set ALLOW_LOCAL_TEMPLATE_ACCEPTANCE=1 to create fictional records in the loopback test database."
  );
const root = process.cwd();
const output = resolve(root, ".scratch/template-design-acceptance");
const rootRequire = createRequire(resolve(root, "package.json"));
rootRequire("dotenv").config({ path: resolve(root, ".env"), quiet: true });
let databaseHost: string;
try {
  databaseHost = new URL(process.env.DATABASE_URL ?? "").hostname;
} catch {
  throw new Error("Configure a valid loopback DATABASE_URL before running this harness.");
}
if (!["127.0.0.1", "localhost"].includes(databaseHost))
  throw new Error("Evidence database must be loopback-only");
const appRequire = createRequire(resolve(root, "apps/web/package.json"));
const { Hono } = appRequire("hono");
const { db, sql } = await import("../../../../packages/db/src/client.ts");
const { tenants, user } = await import("../../../../packages/db/src/schema/index.ts");
const { templatesRoute } = await import("../../../../apps/web/src/server/http/routes/templates.ts");
await mkdir(output, { recursive: true, mode: 0o700 });
const runId = randomUUID().slice(0, 8);
const [tenant] = await db
  .insert(tenants)
  .values({ name: `Northstar Evidence ${runId}`, storageRegion: "legacy" })
  .returning();
const actors = {
  owner: {
    id: `evidence-owner-${runId}`,
    name: "Alex Morgan",
    email: `alex-${runId}@example.com`,
    tenantRole: "member",
  },
  editor: {
    id: `evidence-editor-${runId}`,
    name: "Sam Rivera",
    email: `sam-${runId}@example.com`,
    tenantRole: "member",
  },
  reviewer: {
    id: `evidence-reviewer-${runId}`,
    name: "Jordan Lee",
    email: `jordan-${runId}@example.com`,
    tenantRole: "member",
  },
  sales: {
    id: `evidence-sales-${runId}`,
    name: "Casey Taylor",
    email: `casey-${runId}@example.com`,
    tenantRole: "member",
  },
  admin: {
    id: `evidence-admin-${runId}`,
    name: "Morgan Chen",
    email: `morgan-${runId}@example.com`,
    tenantRole: "admin",
  },
} as const;
const accounts = Object.fromEntries(
  Object.entries(actors).map(([role, actor]) => [role, { ...actor, tenantId: tenant.id }])
);
await db
  .insert(user)
  .values(Object.values(accounts).map((actor) => ({ ...actor, emailVerified: true })));
await writeFile(
  resolve(output, "run.json"),
  JSON.stringify(
    {
      runId,
      tenantId: tenant.id,
      actors: accounts,
      scope:
        "Fictional records; production template core/Hono/UI; real local Postgres; tenant-scoped disk test object adapter; injected loopback personas; no production auth/deployment proof",
    },
    null,
    2
  )
);

await writeFile(
  resolve(output, `run-${runId}.json`),
  await (await import("node:fs/promises")).readFile(resolve(output, "run.json"))
);
const app = new Hono();
app.use("*", async (c: any, next: () => Promise<void>) => {
  const role = c.req.header("X-Evidence-Role");
  const actor = role ? accounts[role as keyof typeof accounts] : undefined;
  if (!actor) return c.json({ error: "Unknown evidence persona" }, 403);
  c.set("user", actor);
  const started = Date.now();
  await next();
  await appendFile(
    resolve(output, "api-ledger.jsonl"),
    JSON.stringify({
      runId,
      at: new Date().toISOString(),
      role,
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      status: c.res.status,
      durationMs: Date.now() - started,
    }) + "\n"
  );
});
app.get("/api/tenant/members", (c: any) =>
  c.json(Object.values(accounts).map((actor) => ({ ...actor, role: actor.tenantRole })))
);
app.get("/api/evidence/personas", (c: any) => c.json(accounts));
app.route("/", templatesRoute);

const server = createServer(async (request, response) => {
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 24 * 1024 * 1024) throw new Error("Evidence request too large");
      chunks.push(Buffer.from(chunk));
    }
    const init: RequestInit & { duplex?: string } = {
      method: request.method,
      headers: request.headers as Record<string, string>,
    };
    if (!["GET", "HEAD"].includes(request.method ?? "GET")) {
      init.body = Buffer.concat(chunks);
      init.duplex = "half";
    }
    const result = await app.fetch(new Request(`http://127.0.0.1:4295${request.url}`, init));
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch (error) {
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({ error: error instanceof Error ? error.message : "Evidence harness failed" })
    );
  }
});
server.listen(4295, "127.0.0.1", () =>
  console.log(
    `Evidence API ready at http://127.0.0.1:4295; run ${runId}; local DB + disk test adapter; injected personas`
  )
);
process.on("SIGTERM", () => server.close(() => void sql.end().finally(() => process.exit(0))));
process.on("SIGINT", () => server.close(() => void sql.end().finally(() => process.exit(0))));
