import { z } from "zod";

export const tabularColumnSchema = z.object({
  index: z.number(),
  name: z.string(),
  prompt: z.string(),
  format: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const createReviewSchema = z.object({
  title: z.string().min(1),
  columnsConfig: z.array(tabularColumnSchema).min(1),
  documentIds: z.array(z.string()).min(1),
  matterId: z.string().uuid().optional(),
});

export const runCellSchema = z.object({
  documentId: z.string(),
  columnIndex: z.number().int(),
  model: z.string().optional(),
});

export const runDocSchema = z.object({
  documentId: z.string(),
  model: z.string().optional(),
});

export const runAllSchema = z.object({
  model: z.string().optional(),
  requestId: z.string().min(1).max(128).optional(),
});

export const updateColumnSchema = z.object({
  name: z.string().min(1).optional(),
  prompt: z.string().min(1).optional(),
  format: z.string().nullish(),
  tags: z.array(z.string()).optional(),
});

export const promptSchema = z.object({
  title: z.string().min(1),
  format: z.string().optional(),
  tags: z.array(z.string()).optional(),
  documentName: z.string().optional(),
  model: z.string().optional(),
});
