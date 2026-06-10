import { z } from "zod";

export const mintTokenSchema = z.object({ label: z.string().optional() });
