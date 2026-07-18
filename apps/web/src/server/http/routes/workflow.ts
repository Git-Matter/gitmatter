import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  createWorkflow,
  deleteWorkflow,
  deleteWorkflowShare,
  getWorkflowForViewer,
  hasMatterAccess,
  hideWorkflow,
  listCommits,
  runPlaybook,
  listHiddenWorkflows,
  listWorkflows,
  listWorkflowPractices,
  listWorkflowShares,
  listWorkflowsPage,
  shareWorkflow,
  unhideWorkflow,
  updateWorkflow,
} from "@workspace/core";
import { type AuthEnv } from "../middleware/auth.js";
import { posthog } from "../../posthog.js";
import { resolveCreateMatter } from "../lib/matter.js";
import { parsePageQuery } from "../lib/page-query.js";
import {
  createWorkflowSchema,
  hideWorkflowSchema,
  patchWorkflowSchema,
  runPlaybookSchema,
  shareWorkflowSchema,
} from "../schemas/workflow.js";

export const workflowRoute = new Hono<AuthEnv>();

const workflowTabs = ["all", "builtin", "custom", "hidden"] as const;
const workflowTypes = ["assistant", "tabular", "playbook"] as const;
const workflowSorts = ["title", "type", "createdAt", "updatedAt", "practice", "source"] as const;

function asTab(v: string | undefined) {
  return workflowTabs.includes(v as (typeof workflowTabs)[number])
    ? (v as (typeof workflowTabs)[number])
    : undefined;
}
function asType(v: string | undefined) {
  return workflowTypes.includes(v as (typeof workflowTypes)[number])
    ? (v as (typeof workflowTypes)[number])
    : undefined;
}

workflowRoute.get("/api/workflows", async (c) => {
  const user = c.get("user");
  const paged = parsePageQuery(c, {
    sorts: workflowSorts,
    filters: { tab: workflowTabs, type: workflowTypes },
  });
  if (paged) {
    // practice is freeform (not a fixed enum), so it's read outside parsePageQuery.
    const practice = c.req.query("practice")?.trim() || undefined;
    return c.json(
      await listWorkflowsPage(user.id, user.email, {
        ...paged,
        practice,
        excludePlaybooks: c.req.query("excludePlaybooks") === "true",
      })
    );
  }
  return c.json(await listWorkflows(user.id, user.email));
});

workflowRoute.post("/api/workflows", zValidator("json", createWorkflowSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  const matterId = body.type === "playbook" ? null : await resolveCreateMatter(user, body.matterId);
  if (body.type !== "playbook" && !matterId) return c.json({ error: "Forbidden" }, 403);
  const id = await createWorkflow(
    { type: "user", userId: user.id },
    {
      title: body.title,
      type: body.type,
      promptMd: body.promptMd ?? "",
      columnsConfig: body.columnsConfig,
      rules: body.rules ?? null,
      practice: body.practice ?? null,
      matterId,
      tenantId: user.tenantId,
    }
  );
  const created = await getWorkflowForViewer(id, user.id, user.email);
  posthog.capture({
    distinctId: user.id,
    event: "workflow created",
    properties: {
      workflow_id: id,
      workflow_type: body.type,
      practice: body.practice ?? undefined,
      matter_id: matterId ?? undefined,
    },
  });
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

// Distinct practices for the current tab/type (static path — must precede /:id).
workflowRoute.get("/api/workflows/practices", async (c) => {
  const user = c.get("user");
  return c.json(
    await listWorkflowPractices(user.id, user.email, {
      tab: asTab(c.req.query("tab")),
      type: asType(c.req.query("type")),
      excludePlaybooks: c.req.query("excludePlaybooks") === "true",
    })
  );
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
  const patch = c.req.valid("json");
  // Library lifecycle: only a firm admin publishes or retires an item.
  if (patch.status && patch.status !== "draft" && user.tenantRole !== "admin")
    return c.json({ error: "Forbidden: only a firm admin can change approval status" }, 403);
  await updateWorkflow({ type: "user", userId: user.id }, id, patch);
  return c.json(await getWorkflowForViewer(id, user.id, user.email));
});

// Run a playbook: materialize a tabular review (one verdict column per rule)
// over the chosen documents. The review is then run like any other review.
workflowRoute.post(
  "/api/workflows/:id/run-playbook",
  zValidator("json", runPlaybookSchema),
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const result = await getWorkflowForViewer(id, user.id, user.email);
    if (!result || (!result.workflow.isSystem && !result.access?.canView))
      return c.json({ error: "Not found" }, 404);
    const body = c.req.valid("json");
    if (!(await hasMatterAccess(user.id, body.matterId, "editor")))
      return c.json({ error: "Forbidden" }, 403);
    try {
      const run = await runPlaybook(
        { type: "user", userId: user.id },
        { playbookId: id, documentIds: body.documentIds, matterId: body.matterId }
      );
      posthog.capture({
        distinctId: user.id,
        event: "playbook run",
        properties: {
          playbook_id: id,
          matter_id: body.matterId,
          document_count: body.documentIds.length,
        },
      });
      return c.json(run, 201);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Failed" }, 400);
    }
  }
);

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
