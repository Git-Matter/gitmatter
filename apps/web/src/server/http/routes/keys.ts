import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  buildModelCatalog,
  deleteUserApiKey,
  getUserJurisdiction,
  hasUserApiKey,
  type LlmProvider,
  recordAudit,
  resolveLlmKey,
  searchOpenRouterModels,
  saveUserApiKey,
  setUserJurisdiction,
} from "@workspace/core";
import { type AuthEnv } from "../middleware/auth.js";
import { clientMeta } from "../lib/request-meta.js";
import {
  apiKeySchema,
  courtListenerKeySchema,
  providerEnum,
  settingsSchema,
} from "../schemas/keys.js";

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

// The chat/tabular model picker lists these: native-key providers grouped with
// their models, availability, and key source. Unavailable providers (no key) are
// still listed so the picker can grey them out with a reason.
keysRoute.get("/api/models", async (c) => {
  return c.json(await buildModelCatalog(c.get("user").id));
});

// Live OpenRouter search backing the picker's "search any model" box. Failures
// (network, OpenRouter down) degrade to an empty list rather than erroring the UI.
keysRoute.get("/api/models/openrouter", async (c) => {
  try {
    return c.json(await searchOpenRouterModels(c.req.query("q") ?? ""));
  } catch {
    return c.json([]);
  }
});

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
  const userId = c.get("user").id;
  await saveUserApiKey(userId, key, provider);
  void recordAudit({
    eventType: "apikey.create",
    actorId: userId,
    target: provider,
    ...clientMeta(c),
  });
  return c.json({ ok: true });
});

keysRoute.delete("/api/keys", async (c) => {
  const provider = c.req.query("provider");
  if (!provider || !PROVIDERS.includes(provider as never))
    return c.json({ error: "unknown provider" }, 400);
  const userId = c.get("user").id;
  await deleteUserApiKey(userId, provider);
  void recordAudit({
    eventType: "apikey.delete",
    actorId: userId,
    target: provider,
    ...clientMeta(c),
  });
  return c.json({ ok: true });
});

// CourtListener (US case-law research) — a non-LLM bring-your-own key, kept on its
// own route so it stays out of the LLM provider list (model catalog, key status).
keysRoute.get("/api/keys/courtlistener", async (c) => {
  return c.json({ hasUserKey: await hasUserApiKey(c.get("user").id, "courtlistener") });
});

keysRoute.put("/api/keys/courtlistener", zValidator("json", courtListenerKeySchema), async (c) => {
  const userId = c.get("user").id;
  await saveUserApiKey(userId, c.req.valid("json").key, "courtlistener");
  void recordAudit({
    eventType: "apikey.create",
    actorId: userId,
    target: "courtlistener",
    ...clientMeta(c),
  });
  return c.json({ ok: true });
});

keysRoute.delete("/api/keys/courtlistener", async (c) => {
  const userId = c.get("user").id;
  await deleteUserApiKey(userId, "courtlistener");
  void recordAudit({
    eventType: "apikey.delete",
    actorId: userId,
    target: "courtlistener",
    ...clientMeta(c),
  });
  return c.json({ ok: true });
});
