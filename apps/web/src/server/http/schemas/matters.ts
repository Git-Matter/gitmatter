import { z } from "zod";
import { JURISDICTIONS } from "@workspace/registry";

export const createClientSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["organization", "individual"]).optional(),
  clientNumber: z.string().optional(),
});

export const updateClientSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["organization", "individual"]).optional(),
  clientNumber: z.string().nullish(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const createMatterSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().min(1),
  practiceArea: z.string().optional(),
  jurisdiction: z
    .string()
    .refine(
      (value) => JURISDICTIONS.some((item) => item.code === value),
      "Choose a recognised jurisdiction"
    )
    .optional(),
  adverseParties: z.array(z.string()).optional(),
});

export const updateMatterSchema = z.object({
  clientId: z.string().uuid().optional(),
  name: z.string().min(1).optional(),
  practiceArea: z.string().nullish(),
  jurisdiction: z.string().nullish(),
  status: z.enum(["open", "closed"]).optional(),
  conflictCleared: z.boolean().optional(),
  conflictNotes: z.string().nullish(),
});

export const conflictsCheckSchema = z.object({
  clientName: z.string().min(1),
  adverseParties: z.array(z.string()).optional(),
});

export const clearConflictsSchema = z.object({ notes: z.string().optional() });

export const addMemberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["owner", "editor", "viewer"]).optional(),
});
