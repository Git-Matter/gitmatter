import { z } from "zod";

export const mintTokenSchema = z.object({
  label: z.string().optional(),
  // Least-privilege scope: restrict the token to specific matters and/or cap
  // its role. Both optional — omitted means an unscoped token.
  allowedMatterIds: z.array(z.string()).min(1).max(100).optional(),
  maxRole: z.enum(["viewer", "editor", "owner"]).optional(),
});
