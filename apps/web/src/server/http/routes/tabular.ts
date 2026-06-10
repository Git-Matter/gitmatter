import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  type MatterRole,
  buildReviewGrid,
  canAccessArtifact,
  createReview,
  diffCommits,
  getReview,
  gridToCsv,
  gridToXlsx,
  listCommits,
  listReviews,
  runCell,
} from "@workspace/core";
import { type AuthEnv } from "../middleware/auth.js";
import { resolveCreateMatter } from "../lib/matter.js";
import { createReviewSchema, runCellSchema } from "../schemas/tabular.js";

export const tabularRoute = new Hono<AuthEnv>();

// Fetch a review only if the caller has matter access at `min` role.
async function access(userId: string, reviewId: string, min: MatterRole = "viewer") {
  if (!(await canAccessArtifact(userId, "tabular_review", reviewId, min))) return null;
  return getReview(reviewId);
}

tabularRoute.get("/api/tabular/reviews", async (c) => {
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
  return c.json({ id: reviewId }, 201);
});

tabularRoute.get("/api/tabular/reviews/:id", async (c) => {
  const result = await access(c.get("user").id, c.req.param("id"));
  if (!result) return c.json({ error: "Not found" }, 404);
  return c.json(result);
});

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
