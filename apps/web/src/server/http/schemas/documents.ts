import { z } from "zod";

export const createDocumentSchema = z.object({
  title: z.string().min(1),
  markdown: z.string().min(1),
  fileType: z.string().optional(),
});
