import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { practiceProfileSchema } from "@workspace/contracts";
import { getPracticeProfile, savePracticeProfile, PracticePermissionError } from "@workspace/core";
import type { AuthEnv } from "../middleware/auth.js";

export const practiceProfileRoute = new Hono<AuthEnv>();
practiceProfileRoute.get("/api/practice-profile", async (c) => {
  try {
    return c.json(await getPracticeProfile(c.get("user").id));
  } catch (error) {
    if (error instanceof PracticePermissionError) return c.json({ error: error.message }, 403);
    throw error;
  }
});
practiceProfileRoute.put(
  "/api/practice-profile",
  zValidator("json", practiceProfileSchema),
  async (c) => {
    try {
      return c.json(await savePracticeProfile(c.get("user").id, c.req.valid("json")));
    } catch (error) {
      if (error instanceof PracticePermissionError) return c.json({ error: error.message }, 403);
      throw error;
    }
  }
);
