import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  createDocument,
  deleteDocument,
  fileTypeFromName,
  listDocuments,
  retryDocument,
  uploadDocument,
} from "@workspace/core";
import { type AuthEnv } from "../middleware/auth.js";
import { createDocumentSchema } from "../schemas/documents.js";

export const documentsRoute = new Hono<AuthEnv>();

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

documentsRoute.get("/api/documents", async (c) => {
  return c.json(await listDocuments(c.get("user").id));
});

// MVP: create a document from pasted text/markdown. File upload + markitdown
// extraction lands in a later phase.
documentsRoute.post("/api/documents", zValidator("json", createDocumentSchema), async (c) => {
  const body = c.req.valid("json");
  const doc = await createDocument(c.get("user").id, {
    title: body.title,
    markdown: body.markdown,
    fileType: body.fileType,
  });
  return c.json(doc, 201);
});

// Upload a PDF/DOCX: bytes -> storage, row inserted `pending`. Markdown
// extraction runs in the background worker; the client polls `status`.
documentsRoute.post("/api/documents/upload", async (c) => {
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) return c.json({ error: "file is required" }, 400);
  const fileType = fileTypeFromName(file.name);
  if (!fileType) return c.json({ error: "only PDF and DOCX/DOC are supported" }, 400);
  if (file.size > MAX_UPLOAD_BYTES) return c.json({ error: "file exceeds 25 MB limit" }, 400);

  const bytes = Buffer.from(await file.arrayBuffer());
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : file.name;
  const doc = await uploadDocument(c.get("user").id, { title, fileType, bytes });
  return c.json(doc, 202);
});

// Re-queue a failed extraction.
documentsRoute.post("/api/documents/:id/retry", async (c) => {
  const doc = await retryDocument(c.get("user").id, c.req.param("id"));
  if (!doc) return c.json({ error: "document not found or not failed" }, 404);
  return c.json(doc);
});

documentsRoute.delete("/api/documents/:id", async (c) => {
  await deleteDocument(c.get("user").id, c.req.param("id"));
  return c.body(null, 204);
});
