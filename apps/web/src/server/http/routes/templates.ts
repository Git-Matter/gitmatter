import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  templateActionSchema,
  templateContentSchema,
  templateSaveSchema,
  templateListQuerySchema,
} from "@workspace/contracts";
import {
  actOnTemplate,
  createTemplate,
  downloadTemplate,
  listTemplateSummaries,
  getTemplate,
  saveTemplate,
  templateHistory,
  TemplateError,
  uploadTemplateFile,
  MAX_TEMPLATE_FILE_BYTES,
  StorageQuotaError,
} from "@workspace/core";
import type { AuthEnv } from "../middleware/auth.js";

export const templatesRoute = new Hono<AuthEnv>();
templatesRoute.onError((error, c) => {
  if (error instanceof TemplateError) return c.json({ error: error.message }, error.status);
  if (error instanceof StorageQuotaError) return c.json({ error: error.message }, 507);
  if (error instanceof z.ZodError)
    return c.json({ error: "Check the template fields and try again" }, 400);
  throw error;
});
templatesRoute.use("/api/templates*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
});
templatesRoute.use(
  "/api/templates*",
  bodyLimit({
    maxSize: MAX_TEMPLATE_FILE_BYTES + 256 * 1024,
    onError: (c) => c.json({ error: "Choose a Word file up to 20 MiB" }, 413),
  })
);

const uploadContentSchema = templateContentSchema.extend({
  body: z.string().max(200_000).default(""),
});
async function readUpload(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new TemplateError("Choose a .docx Word file", 400);
  let raw: unknown;
  const rawContent = form.get("content");
  if (typeof rawContent !== "string") throw new TemplateError("Invalid template fields", 400);
  try {
    raw = JSON.parse(rawContent);
  } catch {
    throw new TemplateError("Invalid template fields", 400);
  }
  const content = uploadContentSchema.parse(raw);
  return { form, file, content };
}
// Register the literal upload endpoint before UUID parameter middleware.
templatesRoute.post("/api/templates/upload", async (c) => {
  const { file, content } = await readUpload(c.req.raw);
  const id = await uploadTemplateFile(
    { type: "user", userId: c.get("user").id },
    content,
    Buffer.from(await file.arrayBuffer()),
    file.name
  );
  return c.json({ id }, 201);
});
templatesRoute.use("/api/templates/:id/*", zValidator("param", z.object({ id: z.uuid() })));
templatesRoute.use("/api/templates/:id", zValidator("param", z.object({ id: z.uuid() })));
templatesRoute.get("/api/templates", zValidator("query", templateListQuerySchema), async (c) =>
  c.json(
    await listTemplateSummaries({ type: "user", userId: c.get("user").id }, c.req.valid("query"))
  )
);
templatesRoute.get("/api/templates/:id", async (c) =>
  c.json(await getTemplate({ type: "user", userId: c.get("user").id }, c.req.param("id")))
);
templatesRoute.post("/api/templates", zValidator("json", templateContentSchema), async (c) =>
  c.json(
    { id: await createTemplate({ type: "user", userId: c.get("user").id }, c.req.valid("json")) },
    201
  )
);
templatesRoute.put("/api/templates/:id", zValidator("json", templateSaveSchema), async (c) => {
  await saveTemplate(
    { type: "user", userId: c.get("user").id },
    c.req.param("id"),
    c.req.valid("json")
  );
  return c.json({ ok: true });
});
templatesRoute.post("/api/templates/:id/upload", async (c) => {
  const { file, content, form } = await readUpload(c.req.raw);
  const update = z
    .object({ expectedHead: z.uuid(), message: z.string().trim().min(1).max(500) })
    .parse({ expectedHead: form.get("expectedHead"), message: form.get("message") });
  await uploadTemplateFile(
    { type: "user", userId: c.get("user").id },
    content,
    Buffer.from(await file.arrayBuffer()),
    file.name,
    { id: c.req.param("id"), ...update }
  );
  return c.json({ ok: true });
});
templatesRoute.post(
  "/api/templates/:id/actions",
  zValidator("json", templateActionSchema),
  async (c) => {
    await actOnTemplate(
      { type: "user", userId: c.get("user").id },
      c.req.param("id"),
      c.req.valid("json")
    );
    return c.json({ ok: true });
  }
);
templatesRoute.get("/api/templates/:id/history", async (c) =>
  c.json(await templateHistory({ type: "user", userId: c.get("user").id }, c.req.param("id")))
);
templatesRoute.get(
  "/api/templates/:id/download",
  zValidator("query", z.object({ revisionId: z.uuid().optional() })),
  async (c) => {
    const file = await downloadTemplate(
      { type: "user", userId: c.get("user").id },
      c.req.param("id"),
      c.req.valid("query").revisionId
    );
    c.header(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    c.header("Content-Disposition", `attachment; filename="${file.filename}"`);
    c.header("X-Template-Revision", file.revisionId);
    return c.body(new Uint8Array(file.bytes).buffer);
  }
);
