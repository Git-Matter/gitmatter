import { z } from "zod";
import { canAccessArtifact } from "../core/index.js";
import { createWorkflow, getWorkflow, listWorkflows, updateWorkflow } from "../platform/index.js";
import type { ToolContext, ToolSpec } from "./types.js";

// Workflow templates (system + user): list, read with per-field blame, and
// create/update. write_workflow creates when no workflowId is given.
export function buildWorkflowTools({ actor, resolveMatter }: ToolContext): ToolSpec[] {
  return [
    {
      name: "list_workflows",
      description: "List available workflow templates (system + user).",
      schema: {},
      handler: async () =>
        (await listWorkflows(actor.userId)).map((w) => ({
          id: w.id,
          title: w.title,
          type: w.type,
          isSystem: w.isSystem,
        })),
    },
    {
      name: "read_workflow",
      description: "Read a workflow template and its per-field blame.",
      schema: { workflowId: z.string() },
      handler: async ({ workflowId }) => {
        const result = await getWorkflow(workflowId as string);
        if (!result) return { error: "Not found" };
        if (
          !result.workflow.isSystem &&
          !(await canAccessArtifact(actor, "workflow", workflowId as string))
        )
          return { error: "Not found" };
        return result;
      },
    },
    {
      name: "write_workflow",
      description: "Create a workflow, or update one by passing workflowId.",
      schema: {
        workflowId: z.string().optional(),
        title: z.string().optional(),
        type: z.enum(["assistant", "tabular"]).optional(),
        promptMd: z.string().optional(),
        matterId: z.string().optional(),
      },
      handler: async ({ workflowId, title, type, promptMd, matterId }) => {
        if (workflowId) {
          const existing = await getWorkflow(workflowId as string);
          if (
            !existing ||
            existing.workflow.isSystem ||
            !(await canAccessArtifact(actor, "workflow", workflowId as string, "editor"))
          )
            return { error: "Not found" };
          await updateWorkflow(actor, workflowId as string, {
            title: title as string | undefined,
            type: type as "assistant" | "tabular" | undefined,
            promptMd: promptMd as string | undefined,
          });
          return { workflowId };
        }
        if (!title || !type || !promptMd)
          return { error: "title, type, promptMd required to create" };
        const resolved = await resolveMatter(matterId as string | undefined);
        if (!resolved) return { error: "Forbidden: no access to that matter" };
        return {
          workflowId: await createWorkflow(actor, {
            title: title as string,
            type: type as "assistant" | "tabular",
            promptMd: promptMd as string,
            matterId: resolved,
          }),
        };
      },
    },
  ];
}
