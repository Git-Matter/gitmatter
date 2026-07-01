import { z } from "zod";
import { canAccessArtifact } from "../core/index.js";
import {
  buildDocxSpec,
  createGeneratedDocument,
  getDocumentDetail,
  type EditSpec,
  proposeEditDetail,
  resolveEdit,
} from "../content/index.js";
import type { ToolContext, ToolSpec } from "./types.js";

// Document generation and redline: generate a .docx artifact, read a document's
// text + tracked edits, and propose/resolve tracked changes (each a commit).
export function buildDocumentTools({ actor, resolveMatter }: ToolContext): ToolSpec[] {
  return [
    {
      name: "generate_docx",
      description:
        "Generate a downloadable Word (.docx) document from structured blocks and file it as a new document artifact. Blocks: {type:'heading',text,level?} | {type:'paragraph',text} | {type:'table',rows:[[..]]} (first row is the header).",
      schema: {
        title: z.string(),
        blocks: z.array(
          z.object({
            type: z.enum(["heading", "paragraph", "table"]),
            text: z.string().optional(),
            level: z.number().optional(),
            rows: z.array(z.array(z.string())).optional(),
          })
        ),
        matterId: z.string().optional(),
      },
      handler: async ({ title, blocks, matterId }) => {
        const resolved = await resolveMatter(matterId as string | undefined);
        if (!resolved) return { error: "Forbidden: no access to that matter" };
        const doc = await createGeneratedDocument(actor, {
          matterId: resolved,
          spec: buildDocxSpec(title as string, blocks as Parameters<typeof buildDocxSpec>[1]),
        });
        return {
          documentId: doc.id,
          title: doc.title,
          download: `/api/documents/${doc.id}/download`,
        };
      },
    },
    {
      name: "get_document",
      description:
        "Get a document's text (markdown) and its tracked edits (with status and blame).",
      schema: { documentId: z.string() },
      handler: async ({ documentId }) => {
        const result = await getDocumentDetail(documentId as string);
        if (!result || !(await canAccessArtifact(actor, "document", documentId as string)))
          return { error: "Not found" };
        return result;
      },
    },
    {
      name: "propose_document_edit",
      description:
        "Propose tracked changes (find -> replace) on a document. Pass ALL edits for this document in a single call via the `edits` array — they land as one version the user accepts or rejects. Keep each `find` to the exact minimal substring being changed; anchor it with `contextBefore`/`contextAfter` (~40 chars of surrounding text, copied verbatim) so the location is unambiguous. The document is unchanged until accepted.",
      schema: {
        documentId: z.string(),
        edits: z
          .array(
            z.object({
              find: z.string(),
              replace: z.string(),
              contextBefore: z.string().optional(),
              contextAfter: z.string().optional(),
              reason: z.string().optional(),
            })
          )
          .min(1),
      },
      handler: async ({ documentId, edits }) => {
        if (!(await canAccessArtifact(actor, "document", documentId as string, "editor")))
          return { error: "Not found" };
        try {
          return await proposeEditDetail(actor, documentId as string, edits as EditSpec[]);
        } catch (e) {
          return { error: e instanceof Error ? e.message : "failed" };
        }
      },
    },
    {
      name: "resolve_document_edit",
      description: "Accept (apply to the document) or reject a tracked change.",
      schema: {
        documentId: z.string(),
        changeId: z.string(),
        decision: z.enum(["accept", "reject"]),
      },
      handler: async ({ documentId, changeId, decision }) => {
        if (!(await canAccessArtifact(actor, "document", documentId as string, "editor")))
          return { error: "Not found" };
        try {
          const r = await resolveEdit(
            actor,
            documentId as string,
            changeId as string,
            decision as "accept" | "reject"
          );
          return { committed: r.commit?.seq };
        } catch (e) {
          return { error: e instanceof Error ? e.message : "failed" };
        }
      },
    },
  ];
}
