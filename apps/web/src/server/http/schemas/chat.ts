import { z } from "zod";
import { SOURCE_IDS } from "@workspace/registry";

export const attachmentSchema = z.object({
  kind: z.enum(["document", "matter", "client", "review"]),
  id: z.string(),
  label: z.string(),
});

export const chatSchema = z.object({
  message: z.string().trim().min(1),
  jurisdiction: z.string().optional(),
  sourceIds: z.array(z.enum(SOURCE_IDS)).optional(),
  model: z.string().optional(),
  attachments: z.array(attachmentSchema).optional(),
  reasoning: z.enum(["low", "medium", "high"]).optional(),
  // Continue an existing conversation; omitted starts a new one.
  chatId: z.string().uuid().optional(),
  // Scope a NEW chat to a matter (the 3-pane matter workspace). Ignored when
  // continuing an existing chat — scope is fixed at creation.
  matterId: z.string().uuid().optional(),
  // The document the user currently has open in the matter viewer. Sent every
  // turn (the open tab changes), so the assistant can resolve "the open document".
  activeDocumentId: z.string().uuid().optional(),
});

export const pinSchema = z.object({ pinned: z.boolean() });
