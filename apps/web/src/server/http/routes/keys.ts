import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  deleteUserApiKey,
  getUserJurisdiction,
  hasUserApiKey,
  LLM_MODELS,
  type LlmProvider,
  resolveLlmKey,
  saveUserApiKey,
  setUserJurisdiction,
} from "@workspace/core";
import { type AuthEnv } from "../middleware/auth.js";
import { apiKeySchema, providerEnum, settingsSchema } from "../schemas/keys.js";

export const keysRoute = new Hono<AuthEnv>();

const PROVIDERS = providerEnum.options;

keysRoute.get("/api/settings", async (c) => {
  return c.json({ jurisdiction: await getUserJurisdiction(c.get("user").id) });
});

keysRoute.put("/api/settings", zValidator("json", settingsSchema), async (c) => {
  const jurisdiction = c.req.valid("json").jurisdiction ?? null;
  await setUserJurisdiction(c.get("user").id, jurisdiction);
  return c.json({ jurisdiction });
});

// The chat/tabular model picker lists these.
keysRoute.get("/api/models", (c) => c.json(LLM_MODELS));

// Per-provider key status: whether the user set their own key, and which key is
// active (their own > server env > none).
keysRoute.get("/api/keys", async (c) => {
  const userId = c.get("user").id;
  const providers = await Promise.all(
    PROVIDERS.map(async (provider) => {
      const [hasUserKey, { source }] = await Promise.all([
        hasUserApiKey(userId, provider),
        resolveLlmKey(userId, provider as LlmProvider),
      ]);
      return { provider, hasUserKey, source };
    })
  );
  return c.json({ providers });
});

keysRoute.put("/api/keys", zValidator("json", apiKeySchema), async (c) => {
  const { provider, key } = c.req.valid("json");
  await saveUserApiKey(c.get("user").id, key, provider);
  return c.json({ ok: true });
});

keysRoute.delete("/api/keys", async (c) => {
  const provider = c.req.query("provider");
  if (!provider || !PROVIDERS.includes(provider as never))
    return c.json({ error: "unknown provider" }, 400);
  await deleteUserApiKey(c.get("user").id, provider);
  return c.json({ ok: true });
});
