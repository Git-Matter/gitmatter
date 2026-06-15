import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  createWorkflow,
  deleteWorkflow,
  deleteWorkflowShare,
  getWorkflowForViewer,
  hideWorkflow,
  listCommits,
  listHiddenWorkflows,
  listWorkflows,
  listWorkflowShares,
  listWorkflowsPage,
  shareWorkflow,
  unhideWorkflow,
  updateWorkflow,
} from "@workspace/core";
import { type AuthEnv } from "../middleware/auth.js";
import { resolveCreateMatter } from "../lib/matter.js";
import {
  createWorkflowSchema,
  hideWorkflowSchema,
  patchWorkflowSchema,
  shareWorkflowSchema,
} from "../schemas/workflow.js";

export const workflowRoute = new Hono<AuthEnv>();

const workflowSources = ["builtin", "custom"] as const;
const workflowSorts = ["title", "type", "isSystem", "createdAt", "updatedAt"] as const;
type WorkflowSourceQuery = (typeof workflowSources)[number];
type WorkflowSortQuery = (typeof workflowSorts)[number];

function isWorkflowSource(value: string | undefined): value is WorkflowSourceQuery {
  return workflowSources.some((source) => source === value);
}

function isWorkflowSort(value: string | undefined): value is WorkflowSortQuery {
  return workflowSorts.some((sort) => sort === value);
}

function workflowPageQuery(c: { req: { query: (name: string) => string | undefined } }) {
  const pageSizeRaw = c.req.query("pageSize");
  if (!pageSizeRaw) return null;
  const page = Math.max(0, Number(c.req.query("page") ?? 0) || 0);
  const pageSize = Math.min(200, Math.max(1, Number(pageSizeRaw) || 50));
  const source = c.req.query("source");
  const sort = c.req.query("sort");
  const dir: "asc" | "desc" = c.req.query("dir") === "asc" ? "asc" : "desc";
  return {
    q: c.req.query("q"),
    source: isWorkflowSource(source) ? source : undefined,
    page,
    pageSize,
    sort: isWorkflowSort(sort) ? sort : undefined,
    dir,
  };
}

workflowRoute.get("/api/workflows", async (c) => {
  const user = c.get("user");
  const paged = workflowPageQuery(c);
  if (paged) return c.json(await listWorkflowsPage(user.id, paged));
  return c.json(await listWorkflows(user.id, user.email));
});

workflowRoute.post("/api/workflows", zValidator("json", createWorkflowSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  const matterId = await resolveCreateMatter(user, body.matterId);
  if (!matterId) return c.json({ error: "Forbidden" }, 403);
  const id = await createWorkflow(
    { type: "user", userId: user.id },
    {
      title: body.title,
      type: body.type,
      promptMd: body.promptMd ?? "",
      columnsConfig: body.columnsConfig,
      practice: body.practice ?? null,
      matterId,
    }
  );
  const created = await getWorkflowForViewer(id, user.id, user.email);
  return c.json(created, 201);
});

// Hidden built-ins (static path — must precede /:id).
workflowRoute.get("/api/workflows/hidden", async (c) => {
  return c.json(await listHiddenWorkflows(c.get("user").id));
});

workflowRoute.post("/api/workflows/hidden", zValidator("json", hideWorkflowSchema), async (c) => {
  await hideWorkflow(c.get("user").id, c.req.valid("json").workflowId);
  return c.body(null, 204);
});

workflowRoute.delete("/api/workflows/hidden/:id", async (c) => {
  await unhideWorkflow(c.get("user").id, c.req.param("id"));
  return c.body(null, 204);
});

workflowRoute.get("/api/workflows/:id", async (c) => {
  const user = c.get("user");
  const result = await getWorkflowForViewer(c.req.param("id"), user.id, user.email);
  if (!result || !result.access?.canView) return c.json({ error: "Not found" }, 404);
  return c.json(result);
});

workflowRoute.patch("/api/workflows/:id", zValidator("json", patchWorkflowSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const result = await getWorkflowForViewer(id, user.id, user.email);
  if (!result || result.workflow.isSystem || !result.access?.canEdit)
    return c.json({ error: "Not found" }, 404);
  await updateWorkflow({ type: "user", userId: user.id }, id, c.req.valid("json"));
  return c.json(await getWorkflowForViewer(id, user.id, user.email));
});

workflowRoute.delete("/api/workflows/:id", async (c) => {
  const user = c.get("user");
  try {
    await deleteWorkflow({ type: "user", userId: user.id }, c.req.param("id"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed";
    return c.json({ error: msg }, msg === "Forbidden" ? 403 : 404);
  }
  return c.body(null, 204);
});

// Sharing — owner/editor only.
workflowRoute.get("/api/workflows/:id/shares", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const result = await getWorkflowForViewer(id, user.id, user.email);
  if (!result || !result.access?.canEdit) return c.json({ error: "Not found" }, 404);
  return c.json(await listWorkflowShares(id));
});

workflowRoute.post(
  "/api/workflows/:id/share",
  zValidator("json", shareWorkflowSchema),
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const result = await getWorkflowForViewer(id, user.id, user.email);
    if (!result || !result.access?.canEdit) return c.json({ error: "Not found" }, 404);
    const body = c.req.valid("json");
    return c.json(
      await shareWorkflow({ type: "user", userId: user.id }, id, {
        emails: body.emails,
        allowEdit: body.allowEdit,
      })
    );
  }
);

workflowRoute.delete("/api/workflows/:id/shares/:shareId", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const result = await getWorkflowForViewer(id, user.id, user.email);
  if (!result || !result.access?.canEdit) return c.json({ error: "Not found" }, 404);
  await deleteWorkflowShare(id, c.req.param("shareId"));
  return c.body(null, 204);
});

workflowRoute.get("/api/workflows/:id/history", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const result = await getWorkflowForViewer(id, user.id, user.email);
  if (!result || !result.access?.canView) return c.json({ error: "Not found" }, 404);
  return c.json(await listCommits("workflow", id));
});
