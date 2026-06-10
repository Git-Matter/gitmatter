import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { listMcpTokens, mintMcpToken, revokeMcpToken } from "@workspace/core";
import { type AuthEnv } from "../middleware/auth.js";
import { mintTokenSchema } from "../schemas/tokens.js";

export const tokensRoute = new Hono<AuthEnv>();

tokensRoute.get("/api/mcp-tokens", async (c) => {
  return c.json(await listMcpTokens(c.get("user").id));
});

tokensRoute.post("/api/mcp-tokens", zValidator("json", mintTokenSchema), async (c) => {
  const label = c.req.valid("json").label?.trim() || "default";
  const token = await mintMcpToken(c.get("user").id, label);
  // Shown once; never retrievable again.
  return c.json({ token }, 201);
});

tokensRoute.delete("/api/mcp-tokens/:id", async (c) => {
  await revokeMcpToken(c.get("user").id, c.req.param("id"));
  return c.body(null, 204);
});
