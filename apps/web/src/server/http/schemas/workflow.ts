import { z } from "zod";
import { tabularColumnSchema } from "./tabular.js";

export const createWorkflowSchema = z.object({
  title: z.string().min(1),
  type: z.enum(["assistant", "tabular"]),
  promptMd: z.string().min(1),
  columnsConfig: z.array(tabularColumnSchema).optional(),
});

export const patchWorkflowSchema = z.object({
  title: z.string().optional(),
  type: z.enum(["assistant", "tabular"]).optional(),
  promptMd: z.string().optional(),
  columnsConfig: z.array(tabularColumnSchema).optional(),
});
