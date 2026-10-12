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
} from "@workspace/core";
import type { AuthEnv } from "../middleware/auth.js";

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
  try {
    const job = await retryJob({ type: "user", userId: c.get("user").id }, c.req.param("id"));
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
  const body = (await c.req.json().catch(() => ({}))) as { model?: unknown; requestId?: unknown };
  if (
    (body.model !== undefined && typeof body.model !== "string") ||
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
