import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  createContract,
  createContractFromDocx,
  fileTypeFromName,
  getContract,
  getContractDocx,
  listCommits,
  listContracts,
  proposeEdit,
  resolveEdit,
} from "@workspace/core";
import { type AuthEnv } from "../middleware/auth.js";
import { createContractSchema, proposeEditSchema, resolveEditSchema } from "../schemas/contract.js";

export const contractRoute = new Hono<AuthEnv>();

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

async function owns(userId: string, contractId: string) {
  const result = await getContract(contractId);
  return result && result.contract.userId === userId ? result : null;
}

contractRoute.get("/api/contracts", async (c) => {
  return c.json(await listContracts(c.get("user").id));
});

contractRoute.post("/api/contracts", zValidator("json", createContractSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  const id = await createContract(
    { type: "user", userId: user.id },
    { title: body.title, body: body.body ?? "", jurisdiction: body.jurisdiction ?? null }
  );
  return c.json({ id }, 201);
});

// Upload a DOCX as a contract: real OOXML tracked-changes redline source.
contractRoute.post("/api/contracts/upload", async (c) => {
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) return c.json({ error: "file is required" }, 400);
  const fileType = fileTypeFromName(file.name);
  if (fileType !== "docx" && fileType !== "doc") {
    return c.json({ error: "contract upload requires a DOCX file" }, 400);
  }
  if (file.size > MAX_UPLOAD_BYTES) return c.json({ error: "file exceeds 25 MB limit" }, 400);

  const bytes = Buffer.from(await file.arrayBuffer());
  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim()
      : file.name.replace(/\.[^.]+$/, "");
  const jurisdiction = typeof body.jurisdiction === "string" ? body.jurisdiction : null;
  try {
    const id = await createContractFromDocx(
      { type: "user", userId: c.get("user").id },
      { title, bytes, jurisdiction }
    );
    return c.json({ id }, 201);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "upload failed" }, 502);
  }
});

contractRoute.get("/api/contracts/:id", async (c) => {
  const result = await owns(c.get("user").id, c.req.param("id"));
  if (!result) return c.json({ error: "Not found" }, 404);
  return c.json(result);
});

// Stream the current DOCX bytes (for client-side docx-preview rendering).
contractRoute.get("/api/contracts/:id/docx", async (c) => {
  const result = await owns(c.get("user").id, c.req.param("id"));
  if (!result) return c.json({ error: "Not found" }, 404);
  const bytes = await getContractDocx(c.req.param("id"));
  if (!bytes) return c.json({ error: "No document version" }, 404);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
  });
});

contractRoute.post("/api/contracts/:id/edits", zValidator("json", proposeEditSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!(await owns(user.id, id))) return c.json({ error: "Not found" }, 404);
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
  return c.json(await getContract(id));
});

contractRoute.post(
  "/api/contracts/:id/edits/:changeId/resolve",
  zValidator("json", resolveEditSchema),
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    if (!(await owns(user.id, id))) return c.json({ error: "Not found" }, 404);
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
    return c.json(await getContract(id));
  }
);

contractRoute.get("/api/contracts/:id/history", async (c) => {
  if (!(await owns(c.get("user").id, c.req.param("id"))))
    return c.json({ error: "Not found" }, 404);
  return c.json(await listCommits("contract", c.req.param("id")));
});
