import { Hono } from "hono";
import { searchMatterWork, matterSearchSchema } from "@workspace/core";
import type { AuthEnv } from "../middleware/auth.js";
export const searchRoute = new Hono<AuthEnv>();
searchRoute.get("/api/search", async (c) => {
  const input = matterSearchSchema.safeParse({
    query: c.req.query("q"),
    matterId: c.req.query("matterId"),
    type: c.req.query("type"),
    page: c.req.query("page") ? Number(c.req.query("page")) : undefined,
    pageSize: c.req.query("pageSize") ? Number(c.req.query("pageSize")) : undefined,
  });
  if (!input.success) return c.json({ error: "Enter a search query and valid filters" }, 400);
  return c.json(await searchMatterWork({ type: "user", userId: c.get("user").id }, input.data));
});
