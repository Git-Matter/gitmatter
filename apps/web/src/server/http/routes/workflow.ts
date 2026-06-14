import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  canAccessArtifact,
  createWorkflow,
  getWorkflow,
  listCommits,
  listWorkflows,
  listWorkflowsPage,
  updateWorkflow,
} from "@workspace/core";
import { type AuthEnv } from "../middleware/auth.js";
import { resolveCreateMatter } from "../lib/matter.js";
import { createWorkflowSchema, patchWorkflowSchema } from "../schemas/workflow.js";

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
  const paged = workflowPageQuery(c);
  if (paged) return c.json(await listWorkflowsPage(c.get("user").id, paged));
  return c.json(await listWorkflows(c.get("user").id));
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
      promptMd: body.promptMd,
      columnsConfig: body.columnsConfig,
      matterId,
    }
  );
  return c.json({ id }, 201);
});

workflowRoute.get("/api/workflows/:id", async (c) => {
  const result = await getWorkflow(c.req.param("id"));
  if (!result) return c.json({ error: "Not found" }, 404);
  // System templates are globally readable; user workflows need matter access.
  if (
    !result.workflow.isSystem &&
    !(await canAccessArtifact(c.get("user").id, "workflow", c.req.param("id")))
  )
    return c.json({ error: "Not found" }, 404);
  return c.json(result);
});

workflowRoute.patch("/api/workflows/:id", zValidator("json", patchWorkflowSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const result = await getWorkflow(id);
  // System templates are read-only; user workflows need editor access.
  if (
    !result ||
    result.workflow.isSystem ||
    !(await canAccessArtifact(user.id, "workflow", id, "editor"))
  )
    return c.json({ error: "Not found" }, 404);
  await updateWorkflow({ type: "user", userId: user.id }, id, c.req.valid("json"));
  return c.json(await getWorkflow(id));
});

workflowRoute.get("/api/workflows/:id/history", async (c) => {
  const id = c.req.param("id");
  const result = await getWorkflow(id);
  if (!result) return c.json({ error: "Not found" }, 404);
  if (!result.workflow.isSystem && !(await canAccessArtifact(c.get("user").id, "workflow", id)))
    return c.json({ error: "Not found" }, 404);
  return c.json(await listCommits("workflow", id));
});
