import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  createWorkflow,
  getWorkflow,
  listCommits,
  listWorkflows,
  updateWorkflow,
} from "@workspace/core";
import { type AuthEnv } from "../middleware/auth.js";
import { createWorkflowSchema, patchWorkflowSchema } from "../schemas/workflow.js";

export const workflowRoute = new Hono<AuthEnv>();

workflowRoute.get("/api/workflows", async (c) => {
  return c.json(await listWorkflows(c.get("user").id));
});

workflowRoute.post("/api/workflows", zValidator("json", createWorkflowSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  const id = await createWorkflow(
    { type: "user", userId: user.id },
    {
      title: body.title,
      type: body.type,
      promptMd: body.promptMd,
      columnsConfig: body.columnsConfig,
    }
  );
  return c.json({ id }, 201);
});

workflowRoute.get("/api/workflows/:id", async (c) => {
  const user = c.get("user");
  const result = await getWorkflow(c.req.param("id"));
  if (!result) return c.json({ error: "Not found" }, 404);
  if (!result.workflow.isSystem && result.workflow.userId !== user.id) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json(result);
});

workflowRoute.patch("/api/workflows/:id", zValidator("json", patchWorkflowSchema), async (c) => {
  const user = c.get("user");
  const result = await getWorkflow(c.req.param("id"));
  if (!result || result.workflow.userId !== user.id) return c.json({ error: "Not found" }, 404);
  await updateWorkflow({ type: "user", userId: user.id }, c.req.param("id"), c.req.valid("json"));
  return c.json(await getWorkflow(c.req.param("id")));
});

workflowRoute.get("/api/workflows/:id/history", async (c) => {
  return c.json(await listCommits("workflow", c.req.param("id")));
});
