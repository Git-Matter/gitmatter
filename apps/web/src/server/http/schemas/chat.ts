import { z } from "zod";

export const attachmentSchema = z.object({
  kind: z.enum(["document", "matter", "client", "review"]),
  id: z.string(),
  label: z.string(),
});

export const chatSchema = z.object({
  message: z.string().trim().min(1),
  jurisdiction: z.string().optional(),
  model: z.string().optional(),
  attachments: z.array(attachmentSchema).optional(),
  reasoning: z.enum(["low", "medium", "high"]).optional(),
  // Continue an existing conversation; omitted starts a new one.
  chatId: z.string().uuid().optional(),
});
