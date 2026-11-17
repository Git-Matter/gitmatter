import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getFirstReviewStatus } from "@workspace/core";
import type { AuthEnv } from "../middleware/auth.js";

export const firstReviewRoute = new Hono<AuthEnv>();

firstReviewRoute.get(
  "/api/first-review",
  zValidator("query", z.object({ matterId: z.uuid().optional() })),
  async (c) => {
    try {
      return c.json(
        await getFirstReviewStatus({ type: "user", userId: c.get("user").id }, c.req.valid("query"))
      );
    } catch (error) {
      if (error instanceof Error && error.message === "access_denied")
        return c.json({ error: "Not found" }, 404);
      throw error;
    }
  }
);
