import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  deleteUserApiKey,
  getUserJurisdiction,
  hasUserApiKey,
  saveUserApiKey,
  setUserJurisdiction,
} from "@workspace/core";
import { type AuthEnv } from "../middleware/auth.js";
import { apiKeySchema, settingsSchema } from "../schemas/keys.js";

export const keysRoute = new Hono<AuthEnv>();

keysRoute.get("/api/settings", async (c) => {
  return c.json({ jurisdiction: await getUserJurisdiction(c.get("user").id) });
});

keysRoute.put("/api/settings", zValidator("json", settingsSchema), async (c) => {
  const jurisdiction = c.req.valid("json").jurisdiction ?? null;
  await setUserJurisdiction(c.get("user").id, jurisdiction);
  return c.json({ jurisdiction });
});

keysRoute.get("/api/keys", async (c) => {
  return c.json({ hasAnthropic: await hasUserApiKey(c.get("user").id, "anthropic") });
});

keysRoute.put("/api/keys", zValidator("json", apiKeySchema), async (c) => {
  await saveUserApiKey(c.get("user").id, c.req.valid("json").anthropicKey, "anthropic");
  return c.json({ hasAnthropic: true });
});

keysRoute.delete("/api/keys", async (c) => {
  await deleteUserApiKey(c.get("user").id, "anthropic");
  return c.json({ hasAnthropic: false });
});
