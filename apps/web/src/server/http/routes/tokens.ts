import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { hasMatterAccess, listMcpTokens, mintMcpToken, revokeMcpToken } from "@workspace/core";
import { type AuthEnv } from "../middleware/auth.js";
import { posthog } from "../../posthog.js";
import { mintTokenSchema } from "../schemas/tokens.js";

export const tokensRoute = new Hono<AuthEnv>();

tokensRoute.get("/api/mcp-tokens", async (c) => {
  return c.json(await listMcpTokens(c.get("user").id));
});

tokensRoute.post("/api/mcp-tokens", zValidator("json", mintTokenSchema), async (c) => {
  const body = c.req.valid("json");
  const label = body.label?.trim() || "default";
  const userId = c.get("user").id;
  // A token can only be scoped to matters the minter is actually staffed on.
  for (const matterId of body.allowedMatterIds ?? []) {
    if (!(await hasMatterAccess(userId, matterId))) {
      return c.json({ error: "Forbidden: no access to one of the selected matters" }, 403);
    }
  }
  const token = await mintMcpToken(userId, label, {
    allowedMatterIds: body.allowedMatterIds ?? null,
    maxRole: body.maxRole ?? null,
  });
  posthog.capture({
    distinctId: userId,
    event: "mcp token created",
    properties: {
      label,
      scoped_matter_count: body.allowedMatterIds?.length ?? 0,
      max_role: body.maxRole ?? undefined,
    },
  });
  // Shown once; never retrievable again.
  return c.json({ token }, 201);
});

tokensRoute.delete("/api/mcp-tokens/:id", async (c) => {
  await revokeMcpToken(c.get("user").id, c.req.param("id"));
  return c.body(null, 204);
});
