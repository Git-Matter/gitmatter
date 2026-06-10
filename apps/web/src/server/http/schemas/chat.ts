import { z } from "zod";

export const chatSchema = z.object({
  message: z.string().trim().min(1),
  jurisdiction: z.string().optional(),
  model: z.string().optional(),
});
