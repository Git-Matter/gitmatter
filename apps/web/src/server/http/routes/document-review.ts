import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { documentReviewInputSchema } from "@workspace/contracts";
import {
  DocumentReviewError,
  exportDocumentReview,
  getDocumentReview,
  recordDocumentReview,
  DOCX_MIME,
} from "@workspace/core";
import type { AuthEnv } from "../middleware/auth.js";

export const documentReviewRoute = new Hono<AuthEnv>();
const documentParam = zValidator("param", z.object({ id: z.string().uuid() }));
documentReviewRoute.get("/api/documents/:id/review", documentParam, async (c) => {
  try {
    return c.json(await getDocumentReview(c.get("user").id, c.req.param("id")));
  } catch (error) {
    if (error instanceof DocumentReviewError) return c.json({ error: error.message }, error.status);
    throw error;
  }
});
documentReviewRoute.post(
  "/api/documents/:id/review",
  documentParam,
  zValidator("json", documentReviewInputSchema),
  async (c) => {
    try {
      return c.json(
        await recordDocumentReview(
          { type: "user", userId: c.get("user").id },
          c.req.param("id"),
          c.req.valid("json")
        )
      );
    } catch (error) {
      if (error instanceof DocumentReviewError)
        return c.json({ error: error.message }, error.status);
      throw error;
    }
  }
);
documentReviewRoute.get("/api/documents/:id/review/export", documentParam, async (c) => {
  try {
    const bytes = await exportDocumentReview(c.get("user").id, c.req.param("id"));
    return new Response(bytes as BodyInit, {
      headers: {
        "Content-Type": DOCX_MIME,
        "Content-Disposition": 'attachment; filename="practitioner-review.docx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof DocumentReviewError) return c.json({ error: error.message }, error.status);
    throw error;
  }
});
