import { z } from "zod";

export const settingsSchema = z.object({ jurisdiction: z.string().nullable().optional() });

export const apiKeySchema = z.object({ anthropicKey: z.string().min(1) });
