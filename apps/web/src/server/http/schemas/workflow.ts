import { z } from "zod";
import { tabularColumnSchema } from "./tabular.js";

const workflowStepSchema = z.object({
  title: z.string().optional(),
  promptMd: z.string(),
});

export const playbookRuleSchema = z.object({
  id: z.string(),
  clauseType: z.string().min(1),
  standardPosition: z.string().min(1),
  fallbacks: z.array(z.union([z.string(), z.object({ clauseId: z.string() })])).optional(),
  unacceptable: z.string().optional(),
  guidance: z.string().optional(),
  severity: z.enum(["red", "yellow"]),
});

export const createWorkflowSchema = z.object({
  title: z.string().min(1),
  type: z.enum(["assistant", "tabular", "playbook"]),
  promptMd: z.string().optional(),
  steps: z.array(workflowStepSchema).nullable().optional(),
  columnsConfig: z.array(tabularColumnSchema).optional(),
  rules: z.array(playbookRuleSchema).nullable().optional(),
  practice: z.string().nullable().optional(),
  matterId: z.string().uuid().optional(),
});

export const patchWorkflowSchema = z.object({
  title: z.string().optional(),
  type: z.enum(["assistant", "tabular", "playbook"]).optional(),
  promptMd: z.string().optional(),
  steps: z.array(workflowStepSchema).nullable().optional(),
  columnsConfig: z.array(tabularColumnSchema).optional(),
  rules: z.array(playbookRuleSchema).nullable().optional(),
  status: z.enum(["draft", "approved", "deprecated"]).optional(),
  practice: z.string().nullable().optional(),
});

export const runPlaybookSchema = z.object({
  matterId: z.string().uuid(),
  documentIds: z.array(z.string().uuid()).min(1),
});

export const shareWorkflowSchema = z.object({
  emails: z.array(z.string().email()).min(1),
  allowEdit: z.boolean().default(false),
});

export const hideWorkflowSchema = z.object({
  workflowId: z.string().uuid(),
});
