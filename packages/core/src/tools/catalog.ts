import { z } from "zod";
import { providersFor } from "@workspace/registry";
import {
  type Actor,
  canAccessArtifact,
  deriveBlame,
  diffCommits,
  getCommit,
  getCommitChanges,
  getUserTenant,
  hasMatterAccess,
  listCommits,
} from "../core/index.js";
import { createReview, getReview, listReviews, runCell, writeCell } from "../ai/index.js";
import {
  buildDocxSpec,
  createGeneratedDocument,
  getDocument,
  getDocumentDetail,
  listDocuments,
  listMatterDocuments,
  type EditSpec,
  proposeEdit,
  resolveEdit,
} from "../content/index.js";
import {
  createClient,
  createMatter,
  createWorkflow,
  ensureDefaultMatter,
  getWorkflow,
  listClients,
  listMattersForUser,
  listWorkflows,
  recordCourtListenerCall,
  resolveCourtListenerKey,
  searchCaseLaw,
  updateWorkflow,
  verifyCitations,
} from "../platform/index.js";

// Returned when a US-jurisdiction user invokes a CourtListener tool without a key
// (their own in Settings → Legal research, or the server-env fallback).
const NO_CL_KEY = {
  error: "No CourtListener API key. Add one in Settings → Legal research.",
} as const;

// One tool definition both consumers share: the MCP server (server.ts) wraps the
// handler's return in MCP content blocks; the chat loop (chat.ts) JSON-stringifies
// it as a tool result. `schema` is a zod raw shape — MCP takes it directly, chat
// converts it to JSON Schema. Handlers return plain data (never throw to the model:
// return an `{ error }` object instead, matching the prior MCP behavior).
export type ToolSpec = {
  name: string;
  description: string;
  schema: z.ZodRawShape;
  handler: (input: Record<string, unknown>) => Promise<unknown>;
};

/**
 * The gitmatter tool catalog, bound to one acting user. Every tool runs as that
 * user (attributed as an agent) and enforces the same per-artifact access checks
 * regardless of whether it's reached over MCP or from the in-app assistant.
 */
export function buildToolCatalog(
  actor: Actor,
  opts: { jurisdiction: string; defaultMatterLabel: string }
): ToolSpec[] {
  const providerIds = new Set(providersFor(opts.jurisdiction).map((p) => p.id));

  // Resolve the matter a new artifact lands in: an explicit (editor-checked)
  // matterId, or the acting user's default matter. Returns null when forbidden.
  const resolveMatter = async (matterId?: string): Promise<string | null> => {
    if (matterId) {
      return (await hasMatterAccess(actor.userId, matterId, "editor")) ? matterId : null;
    }
    const tenantId = await getUserTenant(actor.userId);
    if (!tenantId) return null;
    return ensureDefaultMatter(actor.userId, opts.defaultMatterLabel, tenantId);
  };

  // The git audit spine covers every artifact type the same way.
  const ARTIFACT_TYPES = ["tabular_review", "workflow", "document"] as const;
  const artifactType = z.enum(ARTIFACT_TYPES);
  type ArtifactKind = (typeof ARTIFACT_TYPES)[number];
  const canRead = (kind: ArtifactKind, id: string) => canAccessArtifact(actor.userId, kind, id);

  const tools: ToolSpec[] = [
    {
      name: "list_reviews",
      description: "List the user's tabular reviews.",
      schema: {},
      handler: async () => {
        const rows = await listReviews(actor.userId);
        return rows.map((r) => ({
          id: r.id,
          title: r.title,
          documentIds: r.documentIds,
        }));
      },
    },
    {
      name: "get_review",
      description:
        "Get a tabular review's columns, cells, and per-cell blame (who last set each cell).",
      schema: { reviewId: z.string() },
      handler: async ({ reviewId }) => {
        const result = await getReview(reviewId as string);
        if (
          !result ||
          !(await canAccessArtifact(actor.userId, "tabular_review", reviewId as string))
        )
          return { error: "Not found" };
        return result;
      },
    },
    {
      name: "read_review_cells",
      description:
        "Read specific cells of a tabular review, filtered by column indices and/or document ids. Returns each cell's extracted value, flag, reasoning, and grounding citations with column + document names. Prefer this over get_review when answering a focused question (e.g. why a cell is flagged, what one column found) instead of dumping the whole grid.",
      schema: {
        reviewId: z.string(),
        columnIndices: z.array(z.number()).optional(),
        documentIds: z.array(z.string()).optional(),
      },
      handler: async ({ reviewId, columnIndices, documentIds }) => {
        if (!(await canAccessArtifact(actor.userId, "tabular_review", reviewId as string)))
          return { error: "Not found" };
        const result = await getReview(reviewId as string);
        if (!result) return { error: "Not found" };
        const cols = columnIndices as number[] | undefined;
        const docs = documentIds as string[] | undefined;
        const colSet = cols?.length ? new Set(cols) : null;
        const docSet = docs?.length ? new Set(docs) : null;
        const colName = new Map(result.review.columnsConfig.map((col) => [col.index, col.name]));
        const title = new Map(
          (await listMatterDocuments(result.review.matterId)).map((d) => [d.id, d.title])
        );
        const cells = result.cells
          .filter(
            (cell) =>
              cell.content &&
              (!colSet || colSet.has(cell.columnIndex)) &&
              (!docSet || docSet.has(cell.documentId))
          )
          .map((cell) => ({
            columnIndex: cell.columnIndex,
            column: colName.get(cell.columnIndex) ?? `Column ${cell.columnIndex}`,
            documentId: cell.documentId,
            document: title.get(cell.documentId) ?? cell.documentId,
            summary: cell.content!.summary,
            flag: cell.content!.flag,
            reasoning: cell.content!.reasoning,
            citations: cell.citations ?? [],
          }));
        return { reviewId, cells };
      },
    },
    {
      name: "create_review",
      description: "Create a tabular review over documents with extraction columns.",
      schema: {
        title: z.string(),
        documentIds: z.array(z.string()),
        columns: z.array(
          z.object({
            name: z.string(),
            prompt: z.string(),
            format: z.string().optional(),
            tags: z.array(z.string()).optional(),
          })
        ),
        matterId: z.string().optional(),
      },
      handler: async ({ title, documentIds, columns, matterId }) => {
        const resolved = await resolveMatter(matterId as string | undefined);
        if (!resolved) return { error: "Forbidden: no access to that matter" };
        const reviewId = await createReview(actor, {
          title: title as string,
          documentIds: documentIds as string[],
          columnsConfig: (
            columns as Array<{
              name: string;
              prompt: string;
              format?: string;
              tags?: string[];
            }>
          ).map((c, i) => ({
            index: i,
            name: c.name,
            prompt: c.prompt,
            format: c.format,
            tags: c.tags,
          })),
          matterId: resolved,
        });
        return { reviewId };
      },
    },
    {
      name: "run_cell",
      description: "Extract (or re-extract) one cell with the chosen model and commit the change.",
      schema: {
        reviewId: z.string(),
        documentId: z.string(),
        columnIndex: z.number(),
        model: z.string().optional(),
      },
      handler: async ({ reviewId, documentId, columnIndex, model }) => {
        if (
          !(await canAccessArtifact(actor.userId, "tabular_review", reviewId as string, "editor"))
        )
          return { error: "Not found" };
        try {
          const result = await runCell(actor, {
            reviewId: reviewId as string,
            documentId: documentId as string,
            columnIndex: columnIndex as number,
            model: model as string | undefined,
          });
          return { committed: result.commit?.seq, changes: result.changes };
        } catch (e) {
          return { error: e instanceof Error ? e.message : "failed" };
        }
      },
    },
    {
      name: "write_cell",
      description:
        "Write your own extracted value into one review cell — for when you have read the document yourself and produced the answer. Committed under your name. Use run_cell instead to have gitmatter run its own model. flag is the RAG status: green=ok, yellow=caution, red=problem, grey=n/a.",
      schema: {
        reviewId: z.string(),
        documentId: z.string(),
        columnIndex: z.number(),
        summary: z.string(),
        flag: z.enum(["green", "yellow", "red", "grey"]),
        reasoning: z.string(),
        citations: z.array(z.object({ page: z.number().optional(), quote: z.string() })).optional(),
      },
      handler: async ({
        reviewId,
        documentId,
        columnIndex,
        summary,
        flag,
        reasoning,
        citations,
      }) => {
        if (
          !(await canAccessArtifact(actor.userId, "tabular_review", reviewId as string, "editor"))
        )
          return { error: "Not found" };
        try {
          const result = await writeCell(actor, {
            reviewId: reviewId as string,
            documentId: documentId as string,
            columnIndex: columnIndex as number,
            summary: summary as string,
            flag: flag as string,
            reasoning: reasoning as string,
            citations: citations as { page?: number; quote: string }[] | undefined,
          });
          return { committed: result.commit?.seq, changes: result.changes };
        } catch (e) {
          return { error: e instanceof Error ? e.message : "failed" };
        }
      },
    },
    // ---- Git audit spine: blame/history/diff over ANY artifact ----
    // Every mutation (human route or agent tool) is a commit attributed to an actor
    // (a user, or an agent with its label — e.g. "mcp:<token>" or "chat"). These
    // tools let an inbound agent see who changed what, exactly, and with what.
    {
      name: "history",
      description:
        "List an artifact's commit history (newest first): seq, actor (user or agent + label), op, and message. artifactType: tabular_review | workflow | document.",
      schema: { artifactType, artifactId: z.string() },
      handler: async ({ artifactType: kind, artifactId }) =>
        (await canRead(kind as ArtifactKind, artifactId as string))
          ? listCommits(kind as ArtifactKind, artifactId as string)
          : { error: "Not found" },
    },
    {
      name: "diff",
      description: "Field-level diff of an artifact between two commit sequence numbers.",
      schema: {
        artifactType,
        artifactId: z.string(),
        fromSeq: z.number(),
        toSeq: z.number(),
      },
      handler: async ({ artifactType: kind, artifactId, fromSeq, toSeq }) =>
        (await canRead(kind as ArtifactKind, artifactId as string))
          ? diffCommits(
              kind as ArtifactKind,
              artifactId as string,
              fromSeq as number,
              toSeq as number
            )
          : { error: "Not found" },
    },
    {
      name: "blame",
      description:
        "Which commit last set a given field path — who did it, when, and how. Path examples: cell/<documentId>/<columnIndex> (review), field/prompt_md (workflow), markdown (document).",
      schema: { artifactType, artifactId: z.string(), path: z.string() },
      handler: async ({ artifactType: kind, artifactId, path }) =>
        (await canRead(kind as ArtifactKind, artifactId as string))
          ? deriveBlame(kind as ArtifactKind, artifactId as string, path as string)
          : { error: "Not found" },
    },
    {
      name: "show_commit",
      description:
        "Full detail of one commit: the actor (user or agent + label), op, message, and every field change (before → after). The complete 'who did what, exactly, with what'.",
      schema: { commitId: z.string() },
      handler: async ({ commitId }) => {
        const commit = await getCommit(commitId as string);
        if (!commit || !(await canRead(commit.artifactType, commit.artifactId)))
          return { error: "Not found" };
        return { commit, changes: await getCommitChanges(commitId as string) };
      },
    },

    // ---- Clients & matters ----
    {
      name: "list_clients",
      description: "List the clients you have access to.",
      schema: {},
      handler: async () => listClients(actor.userId),
    },
    {
      name: "create_client",
      description: "Create a client for your firm.",
      schema: {
        name: z.string(),
        type: z.enum(["organization", "individual"]).optional(),
        clientNumber: z.string().optional(),
      },
      handler: async ({ name, type, clientNumber }) => {
        const tenantId = await getUserTenant(actor.userId);
        if (!tenantId) return { error: "Forbidden: no tenant" };
        const client = await createClient(actor.userId, tenantId, {
          name: name as string,
          type: type as "organization" | "individual" | undefined,
          clientNumber: clientNumber as string | undefined,
        });
        return { clientId: client.id, name: client.name, type: client.type };
      },
    },
    {
      name: "list_matters",
      description: "List the matters you're staffed on, with client and your role.",
      schema: {},
      handler: async () => listMattersForUser(actor.userId),
    },
    {
      name: "create_matter",
      description: "Create a matter for a client. You become its owner.",
      schema: {
        clientId: z.string(),
        name: z.string(),
        practiceArea: z.string().optional(),
      },
      handler: async ({ clientId, name, practiceArea }) => {
        const matter = await createMatter(actor.userId, {
          clientId: clientId as string,
          name: name as string,
          practiceArea: practiceArea as string | undefined,
        });
        return { matterId: matter.id };
      },
    },

    {
      name: "list_matter_documents",
      description:
        "List the documents filed under a matter (newest first), with title, type, and extraction status. Use this to find a matter's documents — `search` only matches titles.",
      schema: { matterId: z.string() },
      handler: async ({ matterId }) => {
        const resolved = await resolveMatter(matterId as string | undefined);
        if (!resolved) return { error: "Forbidden: no access to that matter" };
        const docs = await listMatterDocuments(resolved);
        return {
          documents: docs.map((d) => ({
            id: d.id,
            title: d.title,
            fileType: d.fileType,
            status: d.status,
            createdAt: d.createdAt,
          })),
        };
      },
    },

    // ---- Document generation ----
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

    // ---- search / fetch (ChatGPT company-knowledge schema) ----
    {
      name: "search",
      description: "Search your reviews and documents by keyword. Returns ids to pass to `fetch`.",
      schema: { query: z.string() },
      handler: async ({ query }) => {
        const ql = (query as string).toLowerCase();
        const hit = (title: string) => title.toLowerCase().includes(ql);
        const [reviews, docs] = await Promise.all([
          listReviews(actor.userId),
          listDocuments(actor.userId),
        ]);
        const results = [
          ...reviews
            .filter((r) => hit(r.title))
            .map((r) => ({
              id: `review:${r.id}`,
              title: r.title,
              url: `/reviews/${r.id}`,
            })),
          ...docs
            .filter((d) => hit(d.title))
            .map((d) => ({
              id: `document:${d.id}`,
              title: d.title,
              url: `/documents/${d.id}`,
            })),
        ];
        return { results };
      },
    },
    {
      name: "fetch",
      description: "Fetch the full content of a search result by its id.",
      schema: { id: z.string() },
      handler: async ({ id }) => {
        const [kind, artifactId] = (id as string).split(":");
        if (!artifactId) return { error: "Not found" };
        if (kind === "review") {
          if (!(await canAccessArtifact(actor.userId, "tabular_review", artifactId)))
            return { error: "Not found" };
          const r = await getReview(artifactId);
          if (!r) return { error: "Not found" };
          return {
            id,
            title: r.review.title,
            text: JSON.stringify(r, null, 2),
            url: `/reviews/${artifactId}`,
            metadata: { type: "tabular_review" },
          };
        }
        if (kind === "document") {
          if (!(await canAccessArtifact(actor.userId, "document", artifactId)))
            return { error: "Not found" };
          const d = await getDocument(artifactId);
          if (!d) return { error: "Not found" };
          return {
            id,
            title: d.title,
            text: d.markdown ?? "",
            url: `/documents/${artifactId}`,
            metadata: { type: "document", status: d.status },
          };
        }
        return { error: "Not found" };
      },
    },

    // ---- Document redline (tracked changes) ----
    {
      name: "get_document",
      description:
        "Get a document's text (markdown) and its tracked edits (with status and blame).",
      schema: { documentId: z.string() },
      handler: async ({ documentId }) => {
        const result = await getDocumentDetail(documentId as string);
        if (!result || !(await canAccessArtifact(actor.userId, "document", documentId as string)))
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
        if (!(await canAccessArtifact(actor.userId, "document", documentId as string, "editor")))
          return { error: "Not found" };
        try {
          const changeIds = await proposeEdit(actor, documentId as string, edits as EditSpec[]);
          return { changeIds };
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
        if (!(await canAccessArtifact(actor.userId, "document", documentId as string, "editor")))
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

    // ---- Workflows ----
    {
      name: "list_workflows",
      description: "List available workflow templates (system + user).",
      schema: {},
      handler: async () =>
        (await listWorkflows(actor.userId)).map((w) => ({
          id: w.id,
          title: w.title,
          type: w.type,
          isSystem: w.isSystem,
        })),
    },
    {
      name: "read_workflow",
      description: "Read a workflow template and its per-field blame.",
      schema: { workflowId: z.string() },
      handler: async ({ workflowId }) => {
        const result = await getWorkflow(workflowId as string);
        if (!result) return { error: "Not found" };
        if (
          !result.workflow.isSystem &&
          !(await canAccessArtifact(actor.userId, "workflow", workflowId as string))
        )
          return { error: "Not found" };
        return result;
      },
    },
    {
      name: "write_workflow",
      description: "Create a workflow, or update one by passing workflowId.",
      schema: {
        workflowId: z.string().optional(),
        title: z.string().optional(),
        type: z.enum(["assistant", "tabular"]).optional(),
        promptMd: z.string().optional(),
        matterId: z.string().optional(),
      },
      handler: async ({ workflowId, title, type, promptMd, matterId }) => {
        if (workflowId) {
          const existing = await getWorkflow(workflowId as string);
          if (
            !existing ||
            existing.workflow.isSystem ||
            !(await canAccessArtifact(actor.userId, "workflow", workflowId as string, "editor"))
          )
            return { error: "Not found" };
          await updateWorkflow(actor, workflowId as string, {
            title: title as string | undefined,
            type: type as "assistant" | "tabular" | undefined,
            promptMd: promptMd as string | undefined,
          });
          return { workflowId };
        }
        if (!title || !type || !promptMd)
          return { error: "title, type, promptMd required to create" };
        const resolved = await resolveMatter(matterId as string | undefined);
        if (!resolved) return { error: "Forbidden: no access to that matter" };
        return {
          workflowId: await createWorkflow(actor, {
            title: title as string,
            type: type as "assistant" | "tabular",
            promptMd: promptMd as string,
            matterId: resolved,
          }),
        };
      },
    },
  ];

  // ---- Baked-in legal research (jurisdiction-gated). CourtListener is US-only. ----
  if (providerIds.has("courtlistener")) {
    tools.push(
      {
        name: "search_case_law",
        description:
          "Search US case law opinions (CourtListener) by keyword, with optional court/date filters.",
        schema: {
          query: z.string(),
          court: z.string().optional(),
          filedAfter: z.string().optional(),
          filedBefore: z.string().optional(),
          limit: z.number().optional(),
        },
        handler: async (args) => {
          const token = await resolveCourtListenerKey(actor.userId);
          if (!token) return NO_CL_KEY;
          void recordCourtListenerCall({ userId: actor.userId });
          try {
            return await searchCaseLaw(token, args as { query: string });
          } catch (e) {
            return { error: e instanceof Error ? e.message : "failed" };
          }
        },
      },
      {
        name: "verify_citations",
        description:
          "Verify/normalize US reporter citations (e.g. '467 U.S. 837') against CourtListener.",
        schema: { citations: z.array(z.string()) },
        handler: async ({ citations }) => {
          const token = await resolveCourtListenerKey(actor.userId);
          if (!token) return NO_CL_KEY;
          void recordCourtListenerCall({ userId: actor.userId });
          try {
            return await verifyCitations(token, citations as string[]);
          } catch (e) {
            return { error: e instanceof Error ? e.message : "failed" };
          }
        },
      }
    );
  }

  return tools;
}
