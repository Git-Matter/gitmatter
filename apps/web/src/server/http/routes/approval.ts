import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  ApprovalError,
  approvalPolicySchema,
  decideProposal,
  decideProposalBatch,
  getApprovalPolicy,
  getProposal,
  listProposals,
  proposalDecisionSchema,
  setApprovalPolicy,
} from "@workspace/core";
import type { AuthEnv } from "../middleware/auth.js";
export const approvalRoute = new Hono<AuthEnv>();
approvalRoute.onError((error, c) => {
  if (error instanceof ApprovalError)
    return c.json(
      { error: error.message, code: error.code },
      error.code === "access_denied" ? 403 : error.code === "invalid_input" ? 400 : 409
    );
  return c.json({ error: "Approval operation failed." }, 500);
});
approvalRoute.get("/api/matters/:id/approval-policy", (c) =>
  getApprovalPolicy({ type: "user", userId: c.get("user").id }, c.req.param("id")).then((result) =>
    c.json(result)
  )
);
approvalRoute.put(
  "/api/matters/:id/approval-policy",
  zValidator(
    "json",
    z
      .object({
        policy: approvalPolicySchema,
        expectedRevision: z.number().int().nonnegative(),
        reason: z.string().trim().min(1).max(4000),
      })
      .strict()
  ),
  async (c) =>
    c.json(
      await setApprovalPolicy(
        { type: "user", userId: c.get("user").id },
        c.req.param("id"),
        c.req.valid("json")
      )
    )
);
approvalRoute.get(
  "/api/matters/:id/proposals",
  zValidator(
    "query",
    z.object({
      status: z.enum(["pending", "applied", "rejected", "withdrawn"]).optional(),
      afterId: z.uuid().optional(),
      limit: z.coerce.number().int().min(1).max(50).optional(),
    })
  ),
  async (c) =>
    c.json(
      await listProposals(
        { type: "user", userId: c.get("user").id },
        c.req.param("id"),
        c.req.valid("query")
      )
    )
);
approvalRoute.get("/api/proposals/:id", async (c) =>
  c.json(await getProposal({ type: "user", userId: c.get("user").id }, c.req.param("id")))
);
approvalRoute.post(
  "/api/proposals/:id/decision",
  zValidator("json", proposalDecisionSchema),
  async (c) => {
    if (c.req.param("id") !== c.req.valid("json").proposalId)
      return c.json({ error: "Proposal id mismatch." }, 400);
    return c.json(
      await decideProposal({ type: "user", userId: c.get("user").id }, c.req.valid("json"))
    );
  }
);

approvalRoute.post(
  "/api/proposals/decisions",
  zValidator(
    "json",
    z.object({ decisions: z.array(proposalDecisionSchema).min(1).max(50) }).strict()
  ),
  async (c) =>
    c.json(
      await decideProposalBatch(
        { type: "user", userId: c.get("user").id },
        c.req.valid("json").decisions
      )
    )
);
