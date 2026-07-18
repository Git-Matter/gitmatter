import { type Context, Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import {
  activeStoragePath,
  addArtifactShareByEmail,
  addDocumentVersion,
  canAccessArtifact,
  canReadDocument,
  createDocument,
  listArtifactShares,
  removeArtifactShare,
  deleteDocument,
  deleteDocumentVersion,
  discardStagedDocument,
  purgeAbandonedStaged,
  docEvents,
  type DocStatusEvent,
  assertFileTypeMatches,
  DOCX_MIME,
  enqueueExtraction,
  fileTypeFromName,
  getDocument,
  getDocumentDetail,
  getObject,
  hasMatterAccess,
  listCommits,
  linkDocumentsToMatter,
  listDocuments,
  listDocumentsPage,
  listMatterDocuments,
  listVersions,
  proposeEdit,
  recordAudit,
  renameDocument,
  resolveAllEdits,
  resolveEdit,
  resolveEdits,
  retryDocument,
  StorageQuotaError,
  uploadDocument,
} from "@workspace/core";
import { type AuthEnv } from "../middleware/auth.js";
import { posthog } from "../../posthog.js";
import { resolveCreateMatter, resolveUploadMatter } from "../lib/matter.js";
import { parsePageQuery } from "../lib/page-query.js";
import { clientMeta } from "../lib/request-meta.js";
import {
  createDocumentSchema,
  linkDocumentsSchema,
  proposeEditSchema,
  renameDocumentSchema,
  resolveBatchSchema,
  resolveEditSchema,
} from "../schemas/documents.js";

const MIME_BY_TYPE: Record<string, string> = {
  docx: DOCX_MIME,
  doc: "application/msword",
  pdf: "application/pdf",
};

export const documentsRoute = new Hono<AuthEnv>();

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB
// Multipart wraps the file in boundaries + part headers, so Content-Length runs a
// little above the raw file size. Allow 1 MB of slack on the early reject so a
// legitimate ~25 MB file isn't bounced before the exact `file.size` check.
const MAX_BODY_BYTES = MAX_UPLOAD_BYTES + 1024 * 1024;

// Reject an oversized upload from the Content-Length header BEFORE parsing the
// body, so the whole payload is never buffered into memory. Coarse outer guard;
// the precise `file.size > MAX_UPLOAD_BYTES` check still runs after parsing.
function bodyTooLarge(c: Context): boolean {
  const len = Number(c.req.header("content-length"));
  return Number.isFinite(len) && len > MAX_BODY_BYTES;
}

const documentStatuses = ["pending", "processing", "ready", "failed"] as const;
const documentSorts = [
  "title",
  "fileType",
  "status",
  "createdAt",
  "matter",
  "version",
  "shared",
] as const;
const shareScopes = ["all", "mine", "shared"] as const;
const shareRoles = ["viewer", "editor", "owner"] as const;

// List documents. With `?matterId=` (and optional `?folderId=`) returns that
// matter's documents (access-checked); otherwise the caller's own documents.
documentsRoute.get("/api/documents", async (c) => {
  const matterId = c.req.query("matterId");
  const paged = parsePageQuery(c, {
    sorts: documentSorts,
    filters: { status: documentStatuses, scope: shareScopes },
  });
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

// MVP: create a document from pasted text/markdown. File upload + extraction
// lands in a later phase.
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
  if (bodyTooLarge(c)) return c.json({ error: "file exceeds 25 MB limit" }, 400);
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) return c.json({ error: "file is required" }, 400);
  const fileType = fileTypeFromName(file.name);
  if (!fileType) return c.json({ error: "only PDF and DOCX/DOC are supported" }, 400);
  if (file.size > MAX_UPLOAD_BYTES) return c.json({ error: "file exceeds 25 MB limit" }, 400);

  const user = c.get("user");
  const resolved = await resolveUploadMatter(
    user,
    typeof body.matterId === "string" ? body.matterId : undefined
  );
  if (!resolved.ok) return c.json({ error: "Forbidden" }, 403);
  const matterId = resolved.matterId; // null = unfiled

  const bytes = Buffer.from(await file.arrayBuffer());
  // Defense in depth: the extension check above can be spoofed; sniff the magic
  // bytes and reject when content and extension disagree.
  const match = assertFileTypeMatches(file.name, bytes);
  if (!match.ok) return c.json({ error: match.reason }, 400);
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : file.name;
  const folderId = typeof body.folderId === "string" && body.folderId ? body.folderId : null;
  // Chat-composer uploads are staged: hidden from the library until the user sends
  // the turn (commit) or removes the chip (discard).
  const staged = body.staged === "true";
  try {
    const doc = await uploadDocument(user.id, {
      title,
      fileType,
      bytes,
      matterId,
      folderId,
      tenantId: user.tenantId,
      staged,
    });
    enqueueExtraction(doc); // extract in-process, serialized per user
    // Opportunistic backstop: reclaim staged uploads abandoned past the window.
    void purgeAbandonedStaged().catch(() => {});
    void recordAudit({
      eventType: "document.upload",
      actorId: user.id,
      target: doc.id,
      metadata: { title, fileType, matterId },
      ...clientMeta(c),
    });
    posthog.capture({
      distinctId: user.id,
      event: "document uploaded",
      properties: {
        document_id: doc.id,
        file_type: fileType,
        file_size_bytes: file.size,
        matter_id: matterId ?? undefined,
      },
    });
    return c.json(doc, 202);
  } catch (err) {
    // Tenant over its shared storage quota: 507 Insufficient Storage.
    if (err instanceof StorageQuotaError) return c.json({ error: err.message }, 507);
    // Storage/extraction-setup failures (e.g. S3 not configured) surface here.
    const message = err instanceof Error ? err.message : "upload failed";
    return c.json({ error: `Could not store file: ${message}` }, 502);
  }
});

// Link existing documents into a matter (many-to-many). Access-checked against
// the target matter; core only links docs the caller owns within its tenant.
documentsRoute.post("/api/documents/link", zValidator("json", linkDocumentsSchema), async (c) => {
  const user = c.get("user");
  const { matterId, documentIds } = c.req.valid("json");
  if (!(await hasMatterAccess(user.id, matterId))) return c.json({ error: "Not found" }, 404);
  const linked = await linkDocumentsToMatter(user.id, matterId, documentIds);
  return c.json({ linked });
});

// Live extraction status (SSE). The browser opens one stream and patches its
// document cache as `pending -> processing -> ready/failed` events arrive,
// instead of polling. Registered before `/:id` so "events" isn't read as an id.
documentsRoute.get("/api/documents/events", (c) => {
  const userId = c.get("user").id;
  return streamSSE(c, async (stream) => {
    const onStatus = (e: DocStatusEvent) => {
      if (e.userId !== userId) return;
      void stream.writeSSE({ event: "status", data: JSON.stringify(e) });
    };
    docEvents.on("status", onStatus);
    stream.onAbort(() => {
      docEvents.off("status", onStatus);
    });
    // Hold the connection open; ping so proxies don't time the stream out.
    while (!stream.aborted) {
      await stream.writeSSE({ event: "ping", data: "" });
      await stream.sleep(30000);
    }
  });
});

// Download the stored file (e.g. a generated .docx). Viewer access is enough.
documentsRoute.get("/api/documents/:id/download", async (c) => {
  const id = c.req.param("id");
  if (!(await canReadDocument(c.get("user").id, id))) return c.json({ error: "Not found" }, 404);
  const doc = await getDocument(id);
  if (!doc) return c.json({ error: "no stored file" }, 404);
  const storagePath = await activeStoragePath(doc);
  if (!storagePath) return c.json({ error: "no stored file" }, 404);
  const bytes = await getObject(doc.tenantId, storagePath);
  void recordAudit({
    eventType: "document.download",
    actorId: c.get("user").id,
    target: id,
    ...clientMeta(c),
  });
  const mime = MIME_BY_TYPE[doc.fileType] ?? "application/octet-stream";
  const filename = doc.title.endsWith(`.${doc.fileType}`)
    ? doc.title
    : `${doc.title}.${doc.fileType}`;
  // `?inline=1` serves for in-browser preview (e.g. PDF in an iframe) instead of
  // forcing a download.
  const disposition = c.req.query("inline") ? "inline" : "attachment";
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `${disposition}; filename="${filename.replace(/"/g, "")}"`,
    },
  });
});

// Version history for a document (newest first); viewer access is enough.
documentsRoute.get("/api/documents/:id/versions", async (c) => {
  const id = c.req.param("id");
  if (!(await canReadDocument(c.get("user").id, id))) return c.json({ error: "Not found" }, 404);
  return c.json(await listVersions(id));
});

// Upload a new version (replaces the active file). Re-runs extraction so the
// preview/markdown reflect the new bytes. Editor access required.
documentsRoute.post("/api/documents/:id/versions", async (c) => {
  const id = c.req.param("id");
  if (!(await canAccessArtifact(c.get("user").id, "document", id, "editor")))
    return c.json({ error: "Not found" }, 404);
  if (bodyTooLarge(c)) return c.json({ error: "file exceeds 25 MB limit" }, 400);
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) return c.json({ error: "file is required" }, 400);
  const fileType = fileTypeFromName(file.name);
  if (!fileType) return c.json({ error: "only PDF and DOCX/DOC are supported" }, 400);
  if (file.size > MAX_UPLOAD_BYTES) return c.json({ error: "file exceeds 25 MB limit" }, 400);
  const bytes = Buffer.from(await file.arrayBuffer());
  const match = assertFileTypeMatches(file.name, bytes);
  if (!match.ok) return c.json({ error: match.reason }, 400);
  try {
    const doc = await addDocumentVersion({ type: "user", userId: c.get("user").id }, id, {
      fileType,
      bytes,
    });
    enqueueExtraction(doc);
    return c.json(doc, 202);
  } catch (err) {
    if (err instanceof StorageQuotaError) return c.json({ error: err.message }, 507);
    return c.json({ error: err instanceof Error ? err.message : "upload failed" }, 502);
  }
});

// Download a specific version's stored file. Viewer access is enough.
documentsRoute.get("/api/documents/:id/versions/:versionId/download", async (c) => {
  const id = c.req.param("id");
  if (!(await canReadDocument(c.get("user").id, id))) return c.json({ error: "Not found" }, 404);
  const version = (await listVersions(id)).find((v) => v.id === c.req.param("versionId"));
  if (!version?.storagePath) return c.json({ error: "no stored file" }, 404);
  const doc = await getDocument(id);
  if (!doc) return c.json({ error: "Not found" }, 404);
  const bytes = await getObject(doc.tenantId, version.storagePath);
  const base = doc?.title ?? "document";
  const filename = base.endsWith(`.${version.fileType}`) ? base : `${base}.${version.fileType}`;
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": MIME_BY_TYPE[version.fileType] ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
    },
  });
});

// Soft-delete a past version (the active one can't be deleted). Editor access.
documentsRoute.delete("/api/documents/:id/versions/:versionId", async (c) => {
  const id = c.req.param("id");
  if (!(await canAccessArtifact(c.get("user").id, "document", id, "editor")))
    return c.json({ error: "Not found" }, 404);
  try {
    await deleteDocumentVersion(
      { type: "user", userId: c.get("user").id },
      id,
      c.req.param("versionId")
    );
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "failed" }, 400);
  }
  return c.body(null, 204);
});

// Re-queue extraction for a failed (or stale-processing) document.
documentsRoute.post("/api/documents/:id/retry", async (c) => {
  const id = c.req.param("id");
  if (!(await canAccessArtifact(c.get("user").id, "document", id, "editor")))
    return c.json({ error: "Not found" }, 404);
  const doc = await retryDocument(id);
  if (!doc) return c.json({ error: "document not found or not retryable" }, 404);
  enqueueExtraction(doc);
  return c.json(doc);
});

// Document detail with its tracked edits + per-edit blame (for the redline view).
documentsRoute.get("/api/documents/:id", async (c) => {
  const id = c.req.param("id");
  if (!(await canReadDocument(c.get("user").id, id))) return c.json({ error: "Not found" }, 404);
  const result = await getDocumentDetail(id);
  if (!result) return c.json({ error: "Not found" }, 404);
  return c.json(result);
});

// Rename a document. Editor access required.
documentsRoute.patch("/api/documents/:id", zValidator("json", renameDocumentSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!(await canAccessArtifact(user.id, "document", id, "editor")))
    return c.json({ error: "Not found" }, 404);
  const result = await renameDocument(
    { type: "user", userId: user.id },
    id,
    c.req.valid("json").title
  );
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
      await proposeEdit({ type: "user", userId: user.id }, id, [
        { find: body.find, replace: body.replace, reason: body.reason },
      ]);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "failed" }, 400);
    }
    return c.json(await getDocumentDetail(id));
  }
);

// Accept or reject every pending change at once, as one version. Editor access required.
documentsRoute.post(
  "/api/documents/:id/edits/resolve-all",
  zValidator("json", resolveEditSchema),
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    if (!(await canAccessArtifact(user.id, "document", id, "editor")))
      return c.json({ error: "Not found" }, 404);
    try {
      await resolveAllEdits({ type: "user", userId: user.id }, id, c.req.valid("json").decision);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "failed" }, 400);
    }
    return c.json(await getDocumentDetail(id));
  }
);

// Accept or reject a specific set of changes (e.g. one chat turn's batch) as one version.
documentsRoute.post(
  "/api/documents/:id/edits/resolve-batch",
  zValidator("json", resolveBatchSchema),
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    if (!(await canAccessArtifact(user.id, "document", id, "editor")))
      return c.json({ error: "Not found" }, 404);
    const { changeIds, decision } = c.req.valid("json");
    try {
      await resolveEdits({ type: "user", userId: user.id }, id, changeIds, decision);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "failed" }, 400);
    }
    posthog.capture({
      distinctId: user.id,
      event: "document edit resolved",
      properties: {
        document_id: id,
        decision,
        change_count: changeIds.length,
      },
    });
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
  if (!(await canReadDocument(c.get("user").id, id))) return c.json({ error: "Not found" }, 404);
  return c.json(await listCommits("document", id));
});

documentsRoute.delete("/api/documents/:id", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  if (!(await canAccessArtifact(user.id, "document", id, "owner")))
    return c.json({ error: "Not found" }, 404);
  await deleteDocument({ type: "user", userId: user.id }, id);
  return c.body(null, 204);
});

// Discard a staged chat upload: hard-delete the row + free its S3 bytes. Only
// staged docs (the core guards this) — committed library docs use the soft delete
// above. Used when the user removes an upload chip before sending.
documentsRoute.delete("/api/documents/:id/staged", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  if (!(await canAccessArtifact(user.id, "document", id, "owner")))
    return c.json({ error: "Not found" }, 404);
  await discardStagedDocument({ type: "user", userId: user.id }, id);
  return c.body(null, 204);
});

// ---- Sharing (people with access). Owner-only manage; viewer can list. ----

documentsRoute.get("/api/documents/:id/shares", async (c) => {
  const id = c.req.param("id");
  if (!(await canAccessArtifact(c.get("user").id, "document", id)))
    return c.json({ error: "Not found" }, 404);
  return c.json(await listArtifactShares("document", id));
});

documentsRoute.post("/api/documents/:id/shares/by-email", async (c) => {
  const id = c.req.param("id");
  if (!(await canAccessArtifact(c.get("user").id, "document", id, "owner")))
    return c.json({ error: "Not found" }, 404);
  const body = (await c.req.json().catch(() => ({}))) as { email?: string; role?: string };
  if (!body.email?.trim()) return c.json({ error: "email required" }, 400);
  const role = shareRoles.includes(body.role as (typeof shareRoles)[number])
    ? (body.role as (typeof shareRoles)[number])
    : "editor";
  try {
    const userId = await addArtifactShareByEmail("document", id, body.email.trim(), role);
    return c.json({ userId }, 201);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "failed" }, 400);
  }
});

documentsRoute.delete("/api/documents/:id/shares/:userId", async (c) => {
  const id = c.req.param("id");
  if (!(await canAccessArtifact(c.get("user").id, "document", id, "owner")))
    return c.json({ error: "Not found" }, 404);
  await removeArtifactShare("document", id, c.req.param("userId"));
  return c.body(null, 204);
});
