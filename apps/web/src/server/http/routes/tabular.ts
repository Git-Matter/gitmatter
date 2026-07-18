import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import {
  type MatterRole,
  addArtifactShareByEmail,
  buildReviewGrid,
  canAccessArtifact,
  createReview,
  diffCommits,
  generateColumnPrompt,
  getReview,
  gridToCsv,
  gridToXlsx,
  listArtifactShares,
  listCommits,
  listReviews,
  listReviewsPage,
  removeArtifactShare,
  runCell,
  runDocument,
  runReviewStreaming,
  updateReviewColumn,
} from "@workspace/core";
import { type AuthEnv } from "../middleware/auth.js";
import { posthog } from "../../posthog.js";
import { resolveCreateMatter } from "../lib/matter.js";
import { parsePageQuery } from "../lib/page-query.js";
import {
  createReviewSchema,
  promptSchema,
  runAllSchema,
  runCellSchema,
  runDocSchema,
  updateColumnSchema,
} from "../schemas/tabular.js";

export const tabularRoute = new Hono<AuthEnv>();

const reviewSorts = ["title", "matter", "createdAt", "documents", "shared"] as const;
const shareScopes = ["all", "mine", "shared"] as const;
const shareRoles = ["viewer", "editor", "owner"] as const;

// Fetch a review only if the caller has matter access at `min` role.
async function access(userId: string, reviewId: string, min: MatterRole = "viewer") {
  if (!(await canAccessArtifact(userId, "tabular_review", reviewId, min))) return null;
  return getReview(reviewId);
}

tabularRoute.get("/api/tabular/reviews", async (c) => {
  const paged = parsePageQuery(c, { sorts: reviewSorts, filters: { scope: shareScopes } });
  if (paged) return c.json(await listReviewsPage(c.get("user").id, paged));
  return c.json(await listReviews(c.get("user").id));
});

tabularRoute.post("/api/tabular/reviews", zValidator("json", createReviewSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  const matterId = await resolveCreateMatter(user, body.matterId);
  if (!matterId) return c.json({ error: "Forbidden" }, 403);
  const reviewId = await createReview(
    { type: "user", userId: user.id },
    {
      title: body.title,
      columnsConfig: body.columnsConfig,
      documentIds: body.documentIds,
      matterId,
    }
  );
  posthog.capture({
    distinctId: user.id,
    event: "tabular review created",
    properties: {
      review_id: reviewId,
      matter_id: matterId,
      document_count: body.documentIds.length,
      column_count: body.columnsConfig?.length ?? 0,
    },
  });
  return c.json({ id: reviewId }, 201);
});

tabularRoute.get("/api/tabular/reviews/:id", async (c) => {
  const result = await access(c.get("user").id, c.req.param("id"));
  if (!result) return c.json({ error: "Not found" }, 404);
  return c.json(result);
});

// Edit one column's config (prompt/name/format/tags). Editor-only; returns the
// refreshed review so the client updates its cache in place.
tabularRoute.patch(
  "/api/tabular/reviews/:id/columns/:index",
  zValidator("json", updateColumnSchema),
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const index = Number(c.req.param("index"));
    if (!Number.isInteger(index)) return c.json({ error: "Invalid column" }, 400);
    if (!(await canAccessArtifact(user.id, "tabular_review", id, "editor")))
      return c.json({ error: "Not found" }, 404);
    await updateReviewColumn(
      { type: "user", userId: user.id },
      { reviewId: id, columnIndex: index, patch: c.req.valid("json") }
    );
    return c.json(await getReview(id));
  }
);

tabularRoute.post("/api/tabular/reviews/:id/run", zValidator("json", runCellSchema), async (c) => {
  const user = c.get("user");
  const reviewId = c.req.param("id");
  if (!(await access(user.id, reviewId, "editor"))) return c.json({ error: "Not found" }, 404);

  const body = c.req.valid("json");
  try {
    await runCell(
      { type: "user", userId: user.id },
      { reviewId, documentId: body.documentId, columnIndex: body.columnIndex, model: body.model }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "run failed";
    return c.json({ error: msg }, msg.startsWith("No API key") ? 400 : 500);
  }
  return c.json(await getReview(reviewId));
});

// Run every column for one document in a single LLM call (batch path).
tabularRoute.post(
  "/api/tabular/reviews/:id/run-doc",
  zValidator("json", runDocSchema),
  async (c) => {
    const user = c.get("user");
    const reviewId = c.req.param("id");
    if (!(await access(user.id, reviewId, "editor"))) return c.json({ error: "Not found" }, 404);

    const body = c.req.valid("json");
    try {
      await runDocument(
        { type: "user", userId: user.id },
        { reviewId, documentId: body.documentId, model: body.model }
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "run failed";
      return c.json({ error: msg }, msg.startsWith("No API key") ? 400 : 500);
    }
    return c.json(await getReview(reviewId));
  }
);

// Run every cell of the review, streaming progress. Documents run in parallel
// (bounded pool), columns sequentially within a document (so its cached prefix
// is reused). Each cell emits `cell-start` then `cell` (its result) or `error`.
// `done` closes the stream. The client refetches afterwards for blame/history.
tabularRoute.post(
  "/api/tabular/reviews/:id/run-all",
  zValidator("json", runAllSchema),
  async (c) => {
    const user = c.get("user");
    const reviewId = c.req.param("id");
    if (!(await access(user.id, reviewId, "editor"))) return c.json({ error: "Not found" }, 404);
    const body = c.req.valid("json");
    return streamSSE(c, async (stream) => {
      try {
        await runReviewStreaming(
          { type: "user", userId: user.id },
          { reviewId, model: body.model },
          {
            onCellStart: (documentId, columnIndex) =>
              void stream.writeSSE({
                event: "cell-start",
                data: JSON.stringify({ documentId, columnIndex }),
              }),
            onCell: (documentId, columnIndex, cell) =>
              void stream.writeSSE({
                event: "cell",
                data: JSON.stringify({ documentId, columnIndex, cell }),
              }),
            onError: (documentId, columnIndex, message) =>
              void stream.writeSSE({
                event: "error",
                data: JSON.stringify({ documentId, columnIndex, message }),
              }),
          }
        );
        await stream.writeSSE({ event: "done", data: "{}" });
      } catch (e) {
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({ message: e instanceof Error ? e.message : "run failed" }),
        });
      }
    });
  }
);

// Draft a column extraction prompt from its title/format/tags.
tabularRoute.post("/api/tabular/prompt", zValidator("json", promptSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  try {
    const prompt = await generateColumnPrompt({ userId: user.id, ...body });
    return c.json({ prompt });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "prompt generation failed";
    return c.json({ error: msg }, msg.startsWith("No API key") ? 400 : 502);
  }
});

// Export the grid as CSV or XLSX (read-only, no commit).
tabularRoute.get("/api/tabular/reviews/:id/export", async (c) => {
  const id = c.req.param("id");
  if (!(await access(c.get("user").id, id))) return c.json({ error: "Not found" }, 404);
  const grid = await buildReviewGrid(id);
  if (!grid) return c.json({ error: "Not found" }, 404);
  const safe = grid.title.replace(/[^\w.-]+/g, "_") || "review";
  if (c.req.query("format") === "csv") {
    return new Response(gridToCsv(grid), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safe}.csv"`,
      },
    });
  }
  return new Response(gridToXlsx(grid) as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safe}.xlsx"`,
    },
  });
});

tabularRoute.get("/api/tabular/reviews/:id/history", async (c) => {
  if (!(await access(c.get("user").id, c.req.param("id"))))
    return c.json({ error: "Not found" }, 404);
  return c.json(await listCommits("tabular_review", c.req.param("id")));
});

tabularRoute.get("/api/tabular/reviews/:id/diff", async (c) => {
  if (!(await access(c.get("user").id, c.req.param("id"))))
    return c.json({ error: "Not found" }, 404);
  const from = Number(c.req.query("from") ?? "0");
  const to = Number(c.req.query("to") ?? "0");
  return c.json(await diffCommits("tabular_review", c.req.param("id"), from, to));
});

// ---- Sharing (people with access). Owner-only manage; viewer can list. ----

tabularRoute.get("/api/tabular/reviews/:id/shares", async (c) => {
  const id = c.req.param("id");
  if (!(await canAccessArtifact(c.get("user").id, "tabular_review", id)))
    return c.json({ error: "Not found" }, 404);
  return c.json(await listArtifactShares("tabular_review", id));
});

tabularRoute.post("/api/tabular/reviews/:id/shares/by-email", async (c) => {
  const id = c.req.param("id");
  if (!(await canAccessArtifact(c.get("user").id, "tabular_review", id, "owner")))
    return c.json({ error: "Not found" }, 404);
  const body = (await c.req.json().catch(() => ({}))) as { email?: string; role?: string };
  if (!body.email?.trim()) return c.json({ error: "email required" }, 400);
  const role = shareRoles.includes(body.role as (typeof shareRoles)[number])
    ? (body.role as (typeof shareRoles)[number])
    : "editor";
  try {
    const userId = await addArtifactShareByEmail("tabular_review", id, body.email.trim(), role);
    return c.json({ userId }, 201);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "failed" }, 400);
  }
});

tabularRoute.delete("/api/tabular/reviews/:id/shares/:userId", async (c) => {
  const id = c.req.param("id");
  if (!(await canAccessArtifact(c.get("user").id, "tabular_review", id, "owner")))
    return c.json({ error: "Not found" }, 404);
  await removeArtifactShare("tabular_review", id, c.req.param("userId"));
  return c.body(null, 204);
});
