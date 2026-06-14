import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  activeStoragePath,
  canAccessArtifact,
  createDocument,
  deleteDocument,
  DOCX_MIME,
  fileTypeFromName,
  getDocument,
  getDocumentDetail,
  getObject,
  hasMatterAccess,
  listCommits,
  listDocuments,
  listDocumentsPage,
  listMatterDocuments,
  listVersions,
  proposeEdit,
  resolveEdit,
  retryDocument,
  uploadDocument,
} from "@workspace/core";
import { type AuthEnv } from "../middleware/auth.js";
import { resolveCreateMatter } from "../lib/matter.js";
import {
  createDocumentSchema,
  proposeEditSchema,
  resolveEditSchema,
} from "../schemas/documents.js";

export const documentsRoute = new Hono<AuthEnv>();

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

const documentStatuses = ["pending", "processing", "ready", "failed"] as const;
const documentSorts = ["title", "fileType", "status", "createdAt"] as const;
type DocumentStatusQuery = (typeof documentStatuses)[number];
type DocumentSortQuery = (typeof documentSorts)[number];

function isDocumentStatus(value: string | undefined): value is DocumentStatusQuery {
  return documentStatuses.some((status) => status === value);
}

function isDocumentSort(value: string | undefined): value is DocumentSortQuery {
  return documentSorts.some((sort) => sort === value);
}

function pageQuery(c: { req: { query: (name: string) => string | undefined } }) {
  const pageSizeRaw = c.req.query("pageSize");
  if (!pageSizeRaw) return null;
  const page = Math.max(0, Number(c.req.query("page") ?? 0) || 0);
  const pageSize = Math.min(200, Math.max(1, Number(pageSizeRaw) || 50));
  const status = c.req.query("status");
  const sort = c.req.query("sort");
  const dir: "asc" | "desc" = c.req.query("dir") === "asc" ? "asc" : "desc";
  return {
    q: c.req.query("q"),
    status: isDocumentStatus(status) ? status : undefined,
    page,
    pageSize,
    sort: isDocumentSort(sort) ? sort : undefined,
    dir,
  };
}

// List documents. With `?matterId=` (and optional `?folderId=`) returns that
// matter's documents (access-checked); otherwise the caller's own documents.
documentsRoute.get("/api/documents", async (c) => {
  const matterId = c.req.query("matterId");
  const paged = pageQuery(c);
  if (matterId) {
    if (!(await hasMatterAccess(c.get("user").id, matterId)))
      return c.json({ error: "Not found" }, 404);
    const folderQ = c.req.query("folderId");
    const folderId = folderQ === undefined ? undefined : folderQ === "root" ? null : folderQ;
    if (paged) {
      return c.json(
        await listDocumentsPage(c.get("user").id, {
          ...paged,
          matterId,
          folderId,
        })
      );
    }
    return c.json(await listMatterDocuments(matterId, folderId));
  }
  if (paged) return c.json(await listDocumentsPage(c.get("user").id, paged));
  return c.json(await listDocuments(c.get("user").id));
});

// MVP: create a document from pasted text/markdown. File upload + docling
// extraction lands in a later phase.
documentsRoute.post("/api/documents", zValidator("json", createDocumentSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  const matterId = await resolveCreateMatter(user, body.matterId);
  if (!matterId) return c.json({ error: "Forbidden" }, 403);
  const doc = await createDocument(user.id, {
    title: body.title,
    markdown: body.markdown,
    fileType: body.fileType,
    matterId,
    folderId: body.folderId ?? null,
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

  const user = c.get("user");
  const matterId = await resolveCreateMatter(
    user,
    typeof body.matterId === "string" ? body.matterId : undefined
  );
  if (!matterId) return c.json({ error: "Forbidden" }, 403);

  const bytes = Buffer.from(await file.arrayBuffer());
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : file.name;
  const folderId = typeof body.folderId === "string" && body.folderId ? body.folderId : null;
  try {
    const doc = await uploadDocument(user.id, { title, fileType, bytes, matterId, folderId });
    return c.json(doc, 202);
  } catch (err) {
    // Storage/extraction-setup failures (e.g. S3 not configured) surface here.
    const message = err instanceof Error ? err.message : "upload failed";
    return c.json({ error: `Could not store file: ${message}` }, 502);
  }
});

// Download the stored file (e.g. a generated .docx). Viewer access is enough.
documentsRoute.get("/api/documents/:id/download", async (c) => {
  const id = c.req.param("id");
  if (!(await canAccessArtifact(c.get("user").id, "document", id)))
    return c.json({ error: "Not found" }, 404);
  const doc = await getDocument(id);
  if (!doc) return c.json({ error: "no stored file" }, 404);
  const storagePath = await activeStoragePath(doc);
  if (!storagePath) return c.json({ error: "no stored file" }, 404);
  const bytes = await getObject(storagePath);
  const mime = doc.fileType === "docx" ? DOCX_MIME : "application/octet-stream";
  const filename = doc.title.endsWith(".docx") ? doc.title : `${doc.title}.docx`;
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
    },
  });
});

// Version history for a document (newest first); viewer access is enough.
documentsRoute.get("/api/documents/:id/versions", async (c) => {
  const id = c.req.param("id");
  if (!(await canAccessArtifact(c.get("user").id, "document", id)))
    return c.json({ error: "Not found" }, 404);
  return c.json(await listVersions(id));
});

// Re-queue a failed extraction.
documentsRoute.post("/api/documents/:id/retry", async (c) => {
  const id = c.req.param("id");
  if (!(await canAccessArtifact(c.get("user").id, "document", id, "editor")))
    return c.json({ error: "Not found" }, 404);
  const doc = await retryDocument(id);
  if (!doc) return c.json({ error: "document not found or not failed" }, 404);
  return c.json(doc);
});

// Document detail with its tracked edits + per-edit blame (for the redline view).
documentsRoute.get("/api/documents/:id", async (c) => {
  const id = c.req.param("id");
  if (!(await canAccessArtifact(c.get("user").id, "document", id)))
    return c.json({ error: "Not found" }, 404);
  const result = await getDocumentDetail(id);
  if (!result) return c.json({ error: "Not found" }, 404);
  return c.json(result);
});

// Propose a tracked change (find -> replace). Editor access required.
documentsRoute.post(
  "/api/documents/:id/edits",
  zValidator("json", proposeEditSchema),
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    if (!(await canAccessArtifact(user.id, "document", id, "editor")))
      return c.json({ error: "Not found" }, 404);
    const body = c.req.valid("json");
    try {
      await proposeEdit({ type: "user", userId: user.id }, id, {
        find: body.find,
        replace: body.replace,
        reason: body.reason,
      });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "failed" }, 400);
    }
    return c.json(await getDocumentDetail(id));
  }
);

documentsRoute.post(
  "/api/documents/:id/edits/:changeId/resolve",
  zValidator("json", resolveEditSchema),
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    if (!(await canAccessArtifact(user.id, "document", id, "editor")))
      return c.json({ error: "Not found" }, 404);
    try {
      await resolveEdit(
        { type: "user", userId: user.id },
        id,
        c.req.param("changeId"),
        c.req.valid("json").decision
      );
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "failed" }, 400);
    }
    return c.json(await getDocumentDetail(id));
  }
);

documentsRoute.get("/api/documents/:id/history", async (c) => {
  const id = c.req.param("id");
  if (!(await canAccessArtifact(c.get("user").id, "document", id)))
    return c.json({ error: "Not found" }, 404);
  return c.json(await listCommits("document", id));
});

documentsRoute.delete("/api/documents/:id", async (c) => {
  const id = c.req.param("id");
  if (!(await canAccessArtifact(c.get("user").id, "document", id, "editor")))
    return c.json({ error: "Not found" }, 404);
  await deleteDocument(id);
  return c.body(null, 204);
});
