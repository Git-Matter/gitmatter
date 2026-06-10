import { z } from "zod";

export const tabularColumnSchema = z.object({
  index: z.number(),
  name: z.string(),
  prompt: z.string(),
});

export const createReviewSchema = z.object({
  title: z.string().min(1),
  columnsConfig: z.array(tabularColumnSchema).min(1),
  documentIds: z.array(z.string()).min(1),
});

export const runCellSchema = z.object({
  documentId: z.string(),
  columnIndex: z.number().int(),
});
