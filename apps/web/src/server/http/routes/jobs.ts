import { Hono } from "hono";
import {
  cancelJob,
  listReviewJobs,
  queueReviewRun,
  estimateDurableReview,
  getJob,
  JobError,
  listDocumentJobs,
  retryJob,
  startExtractionWorker,
  listMatterJobs,
  getJobControls,
  setJobControls,
  listJobUsageAttribution,
  rowsToCsv,
  listJobNotifications,
  markJobNotificationRead,
} from "@workspace/core";
import type { AuthEnv } from "../middleware/auth.js";
import { jobControlPolicySchema } from "@workspace/contracts";

export const jobsRoute = new Hono<AuthEnv>();
jobsRoute.get("/api/jobs/:id", async (c) => {
  const job = await getJob({ type: "user", userId: c.get("user").id }, c.req.param("id"));
  return job ? c.json(job) : c.json({ error: "Not found" }, 404);
});
jobsRoute.get("/api/documents/:id/jobs", async (c) => {
  return c.json(
    await listDocumentJobs({ type: "user", userId: c.get("user").id }, c.req.param("id"))
  );
});
jobsRoute.post("/api/jobs/:id/cancel", async (c) => {
  const job = await cancelJob({ type: "user", userId: c.get("user").id }, c.req.param("id"));
  return job ? c.json(job) : c.json({ error: "Not found" }, 404);
});
jobsRoute.post("/api/jobs/:id/retry", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    acknowledgeUnknown?: unknown;
    requestId?: unknown;
  };
  if (
    (body.acknowledgeUnknown !== undefined && typeof body.acknowledgeUnknown !== "boolean") ||
    (body.requestId !== undefined &&
      (typeof body.requestId !== "string" || !body.requestId || body.requestId.length > 128))
  )
    return c.json({ error: "Invalid input" }, 400);
  try {
    const job = await retryJob({ type: "user", userId: c.get("user").id }, c.req.param("id"), {
      acknowledgeUnknown: body.acknowledgeUnknown as boolean | undefined,
      requestId: body.requestId as string | undefined,
    });
    startExtractionWorker().wake();
    return c.json(job, 202);
  } catch (error) {
    if (error instanceof JobError)
      return c.json({ error: error.code }, error.code === "access_denied" ? 404 : 409);
    throw error;
  }
});

jobsRoute.get("/api/tabular/reviews/:id/jobs", async (c) => {
  return c.json(
    await listReviewJobs({ type: "user", userId: c.get("user").id }, c.req.param("id"))
  );
});
jobsRoute.post("/api/tabular/reviews/:id/queue", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    model?: unknown;
    requestId?: unknown;
    mode?: unknown;
    acknowledgeUnknown?: unknown;
  };
  if (
    (body.model !== undefined && typeof body.model !== "string") ||
    (body.mode !== undefined && body.mode !== "all" && body.mode !== "failed") ||
    (body.acknowledgeUnknown !== undefined && typeof body.acknowledgeUnknown !== "boolean") ||
    (body.requestId !== undefined &&
      (typeof body.requestId !== "string" || !body.requestId || body.requestId.length > 128))
  )
    return c.json({ error: "Invalid input" }, 400);
  try {
    const result = await queueReviewRun(
      { type: "user", userId: c.get("user").id },
      {
        reviewId: c.req.param("id"),
        model: body.model as string | undefined,
        requestId: body.requestId as string | undefined,
        mode: body.mode as "all" | "failed" | undefined,
        acknowledgeUnknown: body.acknowledgeUnknown as boolean | undefined,
      }
    );
    startExtractionWorker().wake();
    return c.json(result, 202);
  } catch (error) {
    if (error instanceof JobError)
      return c.json({ error: error.code }, error.code === "access_denied" ? 404 : 409);
    throw error;
  }
});

jobsRoute.get("/api/matters/:id/jobs", async (c) => {
  const result = await listMatterJobs(
    { type: "user", userId: c.get("user").id },
    c.req.param("id")
  );
  return result ? c.json(result) : c.json({ error: "Not found" }, 404);
});
jobsRoute.get("/api/matters/:id/job-events", async (c) => {
  const cursor = c.req.query("cursor");
  if (cursor && !/^[0-9a-f-]{36}$/i.test(cursor)) return c.json({ error: "Invalid input" }, 400);
  try {
    const page = await listJobNotifications(
      { type: "user", userId: c.get("user").id },
      c.req.param("id"),
      cursor
    );
    return page ? c.json(page) : c.json({ error: "Not found" }, 404);
  } catch (error) {
    if (error instanceof JobError) return c.json({ error: error.code }, 409);
    throw error;
  }
});
jobsRoute.post("/api/job-events/:id/read", async (c) => {
  return (await markJobNotificationRead(
    { type: "user", userId: c.get("user").id },
    c.req.param("id")
  ))
    ? c.json({ ok: true })
    : c.json({ error: "Not found" }, 404);
});

jobsRoute.get("/api/admin/job-controls", async (c) => {
  try {
    return c.json(await getJobControls({ type: "user", userId: c.get("user").id }));
  } catch (error) {
    if (error instanceof JobError) return c.json({ error: error.code }, 403);
    throw error;
  }
});
jobsRoute.get("/api/admin/job-controls/usage", async (c) => {
  try {
    const rows = await listJobUsageAttribution({ type: "user", userId: c.get("user").id });
    if (c.req.query("format") === "csv") {
      const columns = [
        "day",
        "matterId",
        "actorId",
        "actorType",
        "agentLabel",
        "provider",
        "model",
        "attempts",
        "knownTokens",
        "heldTokens",
        "knownEstimatedUsd",
        "heldEstimatedUsd",
        "unpricedAttempts",
      ] as const;
      c.header("Content-Type", "text/csv; charset=utf-8");
      c.header("Content-Disposition", 'attachment; filename="application-llm-usage.csv"');
      c.header("Cache-Control", "no-store");
      return c.body(
        rowsToCsv([columns.slice(), ...rows.map((row) => columns.map((key) => row[key]))])
      );
    }
    return c.json(rows);
  } catch (error) {
    if (error instanceof JobError) return c.json({ error: error.code }, 403);
    throw error;
  }
});
jobsRoute.patch("/api/admin/job-controls", async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    expectedRevision?: unknown;
    reason?: unknown;
    policy?: unknown;
  } | null;
  const parsed = jobControlPolicySchema.safeParse(body?.policy);
  if (
    !body ||
    !parsed.success ||
    typeof body.expectedRevision !== "number" ||
    typeof body.reason !== "string"
  )
    return c.json({ error: "Invalid input" }, 400);
  try {
    return c.json(
      await setJobControls(
        { type: "user", userId: c.get("user").id },
        { expectedRevision: body.expectedRevision, reason: body.reason, policy: parsed.data }
      )
    );
  } catch (error) {
    if (error instanceof JobError)
      return c.json({ error: error.code }, error.code === "access_denied" ? 403 : 409);
    throw error;
  }
});
jobsRoute.get("/api/tabular/reviews/:id/estimate", async (c) => {
  try {
    return c.json(
      await estimateDurableReview(
        { type: "user", userId: c.get("user").id },
        c.req.param("id"),
        c.req.query("model")
      )
    );
  } catch (error) {
    if (error instanceof JobError)
      return c.json({ error: error.code }, error.code === "access_denied" ? 404 : 409);
    throw error;
  }
});
