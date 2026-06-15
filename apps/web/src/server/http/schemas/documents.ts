import { z } from "zod";

export const createDocumentSchema = z.object({
  title: z.string().min(1),
  markdown: z.string().min(1),
  fileType: z.string().optional(),
  matterId: z.string().uuid().optional(),
  folderId: z.string().uuid().nullish(),
});

export const proposeEditSchema = z.object({
  find: z.string(),
  replace: z.string(),
  reason: z.string().optional(),
});

export const resolveEditSchema = z.object({ decision: z.enum(["accept", "reject"]) });

export const renameDocumentSchema = z.object({ title: z.string().min(1) });
