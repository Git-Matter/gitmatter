import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { GUIDED_TASK_IDS } from "@workspace/registry";
import { ensureGuidedSample, GuidedTaskError, prepareGuidedTask } from "@workspace/core";
import type { AuthEnv } from "../middleware/auth.js";

export const guidedRoute = new Hono<AuthEnv>();

guidedRoute.post("/api/guided/sample", async (c) => {
  try {
    return c.json(await ensureGuidedSample(c.get("user").id));
  } catch (error) {
    if (error instanceof GuidedTaskError) return c.json({ error: error.message }, error.status);
    throw error;
  }
});

const guidedInput = z
  .object({
    task: z.enum(GUIDED_TASK_IDS),
    matterId: z.string().uuid(),
    documentIds: z.array(z.string().uuid()).min(1).max(25),
    jurisdiction: z.string().min(2).max(12),
    instructions: z.string().trim().min(1).max(4000),
  })
  .strict();

guidedRoute.post("/api/guided/prepare", zValidator("json", guidedInput), async (c) => {
  try {
    return c.json(await prepareGuidedTask(c.get("user").id, c.req.valid("json")));
  } catch (error) {
    if (error instanceof GuidedTaskError) return c.json({ error: error.message }, error.status);
    throw error;
  }
});
