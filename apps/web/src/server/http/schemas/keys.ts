import { z } from "zod";

export const settingsSchema = z.object({ jurisdiction: z.string().nullable().optional() });

export const providerEnum = z.enum(["anthropic", "openai", "gemini", "openrouter"]);

export const apiKeySchema = z.object({ provider: providerEnum, key: z.string().min(1) });

// CourtListener is a non-LLM provider key (US case-law research), stored in the
// same encrypted user_api_keys table under provider "courtlistener".
export const courtListenerKeySchema = z.object({ key: z.string().min(1) });
