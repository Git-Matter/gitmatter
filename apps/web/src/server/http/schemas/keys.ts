import { z } from "zod";

export const settingsSchema = z.object({ jurisdiction: z.string().nullable().optional() });

export const providerEnum = z.enum(["anthropic", "openai", "gemini", "openrouter"]);

export const apiKeySchema = z.object({ provider: providerEnum, key: z.string().min(1) });
