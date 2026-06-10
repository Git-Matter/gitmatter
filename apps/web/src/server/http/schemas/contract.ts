import { z } from "zod";

export const createContractSchema = z.object({
  title: z.string().min(1),
  body: z.string().optional(),
  jurisdiction: z.string().nullable().optional(),
});

export const proposeEditSchema = z.object({
  find: z.string(),
  replace: z.string(),
  reason: z.string().optional(),
});

export const resolveEditSchema = z.object({ decision: z.enum(["accept", "reject"]) });
