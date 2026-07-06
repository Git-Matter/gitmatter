import { z } from "zod";
import type { PlaybookRule } from "@workspace/db/schema";
import { canAccessArtifact, canReadDocument } from "../core/index.js";
import { getDocumentContext } from "../content/chunks.js";
import { getDocument } from "../content/documents.js";
import { generatePlaybookRules, runPlaybook } from "../ai/tabular/playbook.js";
import { resolveRunModel } from "../ai/provider/index.js";
import { createWorkflow, getWorkflow, listWorkflows, updateWorkflow } from "../platform/index.js";
import type { ToolContext, ToolSpec } from "./types.js";

const ruleSchema = z.object({
  id: z.string().optional(),
  clauseType: z.string(),
  standardPosition: z.string(),
  fallbacks: z.array(z.union([z.string(), z.object({ clauseId: z.string() })])).optional(),
  unacceptable: z.string().optional(),
  guidance: z.string().optional(),
  severity: z.enum(["red", "yellow"]),
});

const withIds = (rules: Array<z.infer<typeof ruleSchema>>): PlaybookRule[] =>
  rules.map((r, i) => ({ ...r, id: r.id ?? `rule-${i + 1}` }));

// Workflow templates (system + user) and playbooks: list, read with per-field
// blame, create/update, draft rules from a document, and run a playbook.
export function buildWorkflowTools({ actor, resolveMatter }: ToolContext): ToolSpec[] {
  return [
    {
      name: "list_workflows",
      description: "List available workflow templates and playbooks (system + user).",
      schema: {},
      handler: async () =>
        (await listWorkflows(actor.userId)).map((w) => ({
          id: w.id,
          title: w.title,
          type: w.type,
          status: w.status,
          isSystem: w.isSystem,
        })),
    },
    {
      name: "read_workflow",
      description: "Read a workflow template or playbook and its per-field blame.",
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
      description:
        "Create a workflow or playbook, or update one by passing workflowId. Playbooks carry rules (clauseType, standardPosition, fallbacks, unacceptable, guidance, severity) and are created as drafts — a firm admin approves them in the UI.",
      schema: {
        workflowId: z.string().optional(),
        title: z.string().optional(),
        type: z.enum(["assistant", "tabular", "playbook"]).optional(),
        promptMd: z.string().optional(),
        rules: z.array(ruleSchema).optional(),
        matterId: z.string().optional(),
      },
      handler: async ({ workflowId, title, type, promptMd, rules, matterId }) => {
        const parsedRules = rules ? withIds(rules as Array<z.infer<typeof ruleSchema>>) : undefined;
        if (workflowId) {
          const existing = await getWorkflow(workflowId as string);
          if (
            !existing ||
            existing.workflow.isSystem ||
            !(await canAccessArtifact(actor, "workflow", workflowId as string, "editor"))
          )
            return { error: "Not found" };
          // Approved library items change only through the UI's admin flow.
          if (existing.workflow.status === "approved" && existing.workflow.type === "playbook")
            return { error: "Forbidden: approved playbooks are edited by firm admins in the UI" };
          await updateWorkflow(actor, workflowId as string, {
            title: title as string | undefined,
            type: type as "assistant" | "tabular" | "playbook" | undefined,
            promptMd: promptMd as string | undefined,
            rules: parsedRules,
          });
          return { workflowId };
        }
        if (!title || !type || (type !== "playbook" && !promptMd))
          return { error: "title, type, promptMd required to create" };
        if (type === "playbook" && !parsedRules?.length)
          return { error: "rules required to create a playbook" };
        const resolved = await resolveMatter(matterId as string | undefined);
        if (!resolved) return { error: "Forbidden: no access to that matter" };
        return {
          workflowId: await createWorkflow(actor, {
            title: title as string,
            type: type as "assistant" | "tabular" | "playbook",
            promptMd: (promptMd as string | undefined) ?? "",
            rules: parsedRules ?? null,
            matterId: resolved,
          }),
        };
      },
    },
    {
      name: "draft_playbook",
      description:
        "Draft playbook rules from a document — the firm's standard template or a written negotiation guide. Returns rules to review, edit, and save with write_workflow (type playbook).",
      schema: {
        documentId: z.string(),
        contractType: z.string().optional(),
        model: z.string().optional(),
      },
      handler: async ({ documentId, contractType, model }) => {
        if (!(await canReadDocument(actor, documentId as string))) return { error: "Not found" };
        const doc = await getDocument(documentId as string);
        if (!doc?.markdown) return { error: "Document has no extracted text" };
        const context = await getDocumentContext(doc, {
          mode: "query",
          query: [contractType, "standard position fallback unacceptable guidance clause"]
            .filter(Boolean)
            .join(" "),
          task: "playbook",
          repeated: true,
          maxChunks: 24,
        });
        const run = await resolveRunModel(actor.userId, model as string | undefined);
        const rules = await generatePlaybookRules({
          documentText: context.text,
          filename: doc.title,
          contractType: contractType as string | undefined,
          model: run.model,
          apiKey: run.key,
        });
        return { rules, count: rules.length };
      },
    },
    {
      name: "run_playbook",
      description:
        "Run a playbook against documents in a matter: creates a tabular review with one verdict column per rule (green = meets standard, yellow = fallback/needs review, red = crosses a red line), then extraction runs per cell. Returns the reviewId — read results with read_review_cells.",
      schema: {
        playbookId: z.string(),
        documentIds: z.array(z.string()).min(1),
        matterId: z.string().optional(),
      },
      handler: async ({ playbookId, documentIds, matterId }) => {
        const wf = await getWorkflow(playbookId as string);
        if (
          !wf ||
          (!wf.workflow.isSystem &&
            !(await canAccessArtifact(actor, "workflow", playbookId as string)))
        )
          return { error: "Not found" };
        const resolved = await resolveMatter(matterId as string | undefined);
        if (!resolved) return { error: "Forbidden: no access to that matter" };
        for (const docId of documentIds as string[]) {
          if (!(await canReadDocument(actor, docId))) return { error: "Not found" };
        }
        try {
          const result = await runPlaybook(actor, {
            playbookId: playbookId as string,
            documentIds: documentIds as string[],
            matterId: resolved,
          });
          return {
            ...result,
            note: "Review created with pending cells. Run cells with run_cell, or open the review in the UI and press Run.",
          };
        } catch (e) {
          return { error: e instanceof Error ? e.message : "run failed" };
        }
      },
    },
  ];
}
