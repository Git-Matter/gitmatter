import { z } from "zod";
import { tabularColumnSchema } from "./tabular.js";

export const createWorkflowSchema = z.object({
  title: z.string().min(1),
  type: z.enum(["assistant", "tabular"]),
  promptMd: z.string().optional(),
  columnsConfig: z.array(tabularColumnSchema).optional(),
  practice: z.string().nullable().optional(),
  matterId: z.string().uuid().optional(),
});

export const patchWorkflowSchema = z.object({
  title: z.string().optional(),
  type: z.enum(["assistant", "tabular"]).optional(),
  promptMd: z.string().optional(),
  columnsConfig: z.array(tabularColumnSchema).optional(),
  practice: z.string().nullable().optional(),
});

export const shareWorkflowSchema = z.object({
  emails: z.array(z.string().email()).min(1),
  allowEdit: z.boolean().default(false),
});

export const hideWorkflowSchema = z.object({
  workflowId: z.string().uuid(),
});
