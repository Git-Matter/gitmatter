import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  canAccessArtifact,
  createContract,
  createGeneratedDocument,
  createMatter,
  createReview,
  createWorkflow,
  deriveBlame,
  buildDocxSpec,
  diffCommits,
  ensureDefaultMatter,
  getContract,
  getDocument,
  getReview,
  getWorkflow,
  hasMatterAccess,
  listClients,
  listCommits,
  listContracts,
  listDocuments,
  listMattersForUser,
  listReviews,
  listWorkflows,
  proposeEdit,
  resolveEdit,
  runCell,
  searchCaseLaw,
  updateWorkflow,
  verifyCitations,
} from "@workspace/core";
import type { Actor } from "@workspace/core";
import { providersFor } from "@workspace/registry";

function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

/**
 * The MCP server gitcounsel exposes to Claude Desktop / CLI / Cowork. Every tool
 * acts as the gitcounsel user the token was minted by, attributed as an agent so
 * its mutations land in the same git-style audit log as human actions.
 */
export function buildMcpServer(account: { userId: string; label: string; jurisdiction: string }) {
  const actor: Actor = {
    type: "agent",
    userId: account.userId,
    agentLabel: `mcp:${account.label}`,
  };
  const server = new McpServer({ name: "gitcounsel", version: "0.1.0" });
  const providerIds = new Set(providersFor(account.jurisdiction).map((p) => p.id));

  // Resolve the matter a new artifact lands in: an explicit (editor-checked)
  // matterId, or the agent user's default matter. Returns null when forbidden.
  const resolveMatter = async (matterId?: string): Promise<string | null> => {
    if (matterId) {
      return (await hasMatterAccess(actor.userId, matterId, "editor")) ? matterId : null;
    }
    return ensureDefaultMatter(actor.userId, account.label);
  };

  // Viewer access to a review — guards the read-only audit tools below.
  const canReadReview = (reviewId: string) =>
    canAccessArtifact(actor.userId, "tabular_review", reviewId);

  server.registerTool(
    "list_reviews",
    { description: "List the user's tabular reviews.", inputSchema: {} },
    async () => {
      const rows = await listReviews(actor.userId);
      return json(rows.map((r) => ({ id: r.id, title: r.title, documentIds: r.documentIds })));
    }
  );

  server.registerTool(
    "get_review",
    {
      description:
        "Get a tabular review's columns, cells, and per-cell blame (who last set each cell).",
      inputSchema: { reviewId: z.string() },
    },
    async ({ reviewId }) => {
      const result = await getReview(reviewId);
      if (!result || !(await canAccessArtifact(actor.userId, "tabular_review", reviewId)))
        return json({ error: "Not found" });
      return json(result);
    }
  );

  server.registerTool(
    "create_review",
    {
      description: "Create a tabular review over documents with extraction columns.",
      inputSchema: {
        title: z.string(),
        documentIds: z.array(z.string()),
        columns: z.array(z.object({ name: z.string(), prompt: z.string() })),
        matterId: z.string().optional(),
      },
    },
    async ({ title, documentIds, columns, matterId }) => {
      const resolved = await resolveMatter(matterId);
      if (!resolved) return json({ error: "Forbidden: no access to that matter" });
      const reviewId = await createReview(actor, {
        title,
        documentIds,
        columnsConfig: columns.map((c, i) => ({ index: i, name: c.name, prompt: c.prompt })),
        matterId: resolved,
      });
      return json({ reviewId });
    }
  );

  server.registerTool(
    "run_cell",
    {
      description: "Extract (or re-extract) one cell with the chosen model and commit the change.",
      inputSchema: {
        reviewId: z.string(),
        documentId: z.string(),
        columnIndex: z.number(),
        model: z.string().optional(),
      },
    },
    async ({ reviewId, documentId, columnIndex, model }) => {
      if (!(await canAccessArtifact(actor.userId, "tabular_review", reviewId, "editor")))
        return json({ error: "Not found" });
      try {
        const result = await runCell(actor, { reviewId, documentId, columnIndex, model });
        return json({ committed: result.commit?.seq, changes: result.changes });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : "failed" });
      }
    }
  );

  server.registerTool(
    "query_history",
    {
      description: "List the commit history for a review (newest first).",
      inputSchema: { reviewId: z.string() },
    },
    async ({ reviewId }) =>
      (await canReadReview(reviewId))
        ? json(await listCommits("tabular_review", reviewId))
        : json({ error: "Not found" })
  );

  server.registerTool(
    "diff",
    {
      description: "Field-level diff of a review between two commit sequence numbers.",
      inputSchema: { reviewId: z.string(), fromSeq: z.number(), toSeq: z.number() },
    },
    async ({ reviewId, fromSeq, toSeq }) =>
      (await canReadReview(reviewId))
        ? json(await diffCommits("tabular_review", reviewId, fromSeq, toSeq))
        : json({ error: "Not found" })
  );

  server.registerTool(
    "blame",
    {
      description:
        "Which commit last set a given field path (e.g. cell/<documentId>/<columnIndex>).",
      inputSchema: { reviewId: z.string(), path: z.string() },
    },
    async ({ reviewId, path }) =>
      (await canReadReview(reviewId))
        ? json(await deriveBlame("tabular_review", reviewId, path))
        : json({ error: "Not found" })
  );

  // ---- Clients & matters (org structure). Matter-team management is UI-only. ----

  server.registerTool(
    "list_clients",
    { description: "List the firm's clients.", inputSchema: {} },
    async () => json(await listClients())
  );

  server.registerTool(
    "list_matters",
    {
      description: "List the matters you're staffed on, with client and your role.",
      inputSchema: {},
    },
    async () => json(await listMattersForUser(actor.userId))
  );

  server.registerTool(
    "create_matter",
    {
      description: "Create a matter for a client. You become its owner.",
      inputSchema: {
        clientId: z.string(),
        name: z.string(),
        matterNumber: z.string().optional(),
        practiceArea: z.string().optional(),
      },
    },
    async ({ clientId, name, matterNumber, practiceArea }) => {
      const matter = await createMatter(actor.userId, {
        clientId,
        name,
        matterNumber,
        practiceArea,
      });
      return json({ matterId: matter.id });
    }
  );

  // ---- Document generation ----

  server.registerTool(
    "generate_docx",
    {
      description:
        "Generate a downloadable Word (.docx) document from structured blocks and file it as a new document artifact. Blocks: {type:'heading',text,level?} | {type:'paragraph',text} | {type:'table',rows:[[..]]} (first row is the header).",
      inputSchema: {
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
    },
    async ({ title, blocks, matterId }) => {
      const resolved = await resolveMatter(matterId);
      if (!resolved) return json({ error: "Forbidden: no access to that matter" });
      const doc = await createGeneratedDocument(actor, {
        matterId: resolved,
        spec: buildDocxSpec(title, blocks),
      });
      return json({
        documentId: doc.id,
        title: doc.title,
        download: `/api/documents/${doc.id}/download`,
      });
    }
  );

  // ---- search / fetch (ChatGPT company-knowledge schema) ----

  server.registerTool(
    "search",
    {
      description:
        "Search your reviews, contracts, and documents by keyword. Returns ids to pass to `fetch`.",
      inputSchema: { query: z.string() },
    },
    async ({ query }) => {
      const ql = query.toLowerCase();
      const hit = (title: string) => title.toLowerCase().includes(ql);
      const [reviews, contracts, docs] = await Promise.all([
        listReviews(actor.userId),
        listContracts(actor.userId),
        listDocuments(actor.userId),
      ]);
      const results = [
        ...reviews
          .filter((r) => hit(r.title))
          .map((r) => ({ id: `review:${r.id}`, title: r.title, url: `/reviews/${r.id}` })),
        ...contracts
          .filter((c) => hit(c.title))
          .map((c) => ({ id: `contract:${c.id}`, title: c.title, url: `/contracts/${c.id}` })),
        ...docs
          .filter((d) => hit(d.title))
          .map((d) => ({ id: `document:${d.id}`, title: d.title, url: "/documents" })),
      ];
      return json({ results });
    }
  );

  server.registerTool(
    "fetch",
    {
      description: "Fetch the full content of a search result by its id.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const [kind, artifactId] = id.split(":");
      if (!artifactId) return json({ error: "Not found" });
      if (kind === "contract") {
        if (!(await canAccessArtifact(actor.userId, "contract", artifactId)))
          return json({ error: "Not found" });
        const r = await getContract(artifactId);
        if (!r) return json({ error: "Not found" });
        return json({
          id,
          title: r.contract.title,
          text: r.contract.body,
          url: `/contracts/${artifactId}`,
          metadata: { type: "contract" },
        });
      }
      if (kind === "review") {
        if (!(await canAccessArtifact(actor.userId, "tabular_review", artifactId)))
          return json({ error: "Not found" });
        const r = await getReview(artifactId);
        if (!r) return json({ error: "Not found" });
        return json({
          id,
          title: r.review.title,
          text: JSON.stringify(r, null, 2),
          url: `/reviews/${artifactId}`,
          metadata: { type: "tabular_review" },
        });
      }
      if (kind === "document") {
        if (!(await canAccessArtifact(actor.userId, "document", artifactId)))
          return json({ error: "Not found" });
        const d = await getDocument(artifactId);
        if (!d) return json({ error: "Not found" });
        return json({
          id,
          title: d.title,
          text: d.markdown ?? "",
          url: "/documents",
          metadata: { type: "document", status: d.status },
        });
      }
      return json({ error: "Not found" });
    }
  );

  // --- Contracts (text redline) ---

  server.registerTool(
    "list_contracts",
    { description: "List the user's contracts.", inputSchema: {} },
    async () => json((await listContracts(actor.userId)).map((c) => ({ id: c.id, title: c.title })))
  );

  server.registerTool(
    "get_contract",
    {
      description: "Get a contract's body and its tracked edits (with status and blame).",
      inputSchema: { contractId: z.string() },
    },
    async ({ contractId }) => {
      const result = await getContract(contractId);
      if (!result || !(await canAccessArtifact(actor.userId, "contract", contractId)))
        return json({ error: "Not found" });
      return json(result);
    }
  );

  server.registerTool(
    "create_contract",
    {
      description: "Create a contract from text/markdown.",
      inputSchema: { title: z.string(), body: z.string(), matterId: z.string().optional() },
    },
    async ({ title, body, matterId }) => {
      const resolved = await resolveMatter(matterId);
      if (!resolved) return json({ error: "Forbidden: no access to that matter" });
      return json({ contractId: await createContract(actor, { title, body, matterId: resolved }) });
    }
  );

  server.registerTool(
    "propose_contract_edit",
    {
      description:
        "Propose a tracked change (find -> replace). Creates a pending edit; body unchanged until accepted.",
      inputSchema: {
        contractId: z.string(),
        find: z.string(),
        replace: z.string(),
        reason: z.string().optional(),
      },
    },
    async ({ contractId, find, replace, reason }) => {
      if (!(await canAccessArtifact(actor.userId, "contract", contractId, "editor")))
        return json({ error: "Not found" });
      try {
        const changeId = await proposeEdit(actor, contractId, { find, replace, reason });
        return json({ changeId });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : "failed" });
      }
    }
  );

  server.registerTool(
    "resolve_contract_edit",
    {
      description: "Accept (apply to body) or reject a tracked change.",
      inputSchema: {
        contractId: z.string(),
        changeId: z.string(),
        decision: z.enum(["accept", "reject"]),
      },
    },
    async ({ contractId, changeId, decision }) => {
      if (!(await canAccessArtifact(actor.userId, "contract", contractId, "editor")))
        return json({ error: "Not found" });
      try {
        const r = await resolveEdit(actor, contractId, changeId, decision);
        return json({ committed: r.commit?.seq });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : "failed" });
      }
    }
  );

  // --- Workflows ---

  server.registerTool(
    "list_workflows",
    { description: "List available workflow templates (system + user).", inputSchema: {} },
    async () =>
      json(
        (await listWorkflows(actor.userId)).map((w) => ({
          id: w.id,
          title: w.title,
          type: w.type,
          isSystem: w.isSystem,
        }))
      )
  );

  server.registerTool(
    "read_workflow",
    {
      description: "Read a workflow template and its per-field blame.",
      inputSchema: { workflowId: z.string() },
    },
    async ({ workflowId }) => {
      const result = await getWorkflow(workflowId);
      if (!result) return json({ error: "Not found" });
      if (
        !result.workflow.isSystem &&
        !(await canAccessArtifact(actor.userId, "workflow", workflowId))
      )
        return json({ error: "Not found" });
      return json(result);
    }
  );

  server.registerTool(
    "write_workflow",
    {
      description: "Create a workflow, or update one by passing workflowId.",
      inputSchema: {
        workflowId: z.string().optional(),
        title: z.string().optional(),
        type: z.enum(["assistant", "tabular"]).optional(),
        promptMd: z.string().optional(),
        matterId: z.string().optional(),
      },
    },
    async ({ workflowId, title, type, promptMd, matterId }) => {
      if (workflowId) {
        const existing = await getWorkflow(workflowId);
        if (
          !existing ||
          existing.workflow.isSystem ||
          !(await canAccessArtifact(actor.userId, "workflow", workflowId, "editor"))
        )
          return json({ error: "Not found" });
        await updateWorkflow(actor, workflowId, { title, type, promptMd });
        return json({ workflowId });
      }
      if (!title || !type || !promptMd)
        return json({ error: "title, type, promptMd required to create" });
      const resolved = await resolveMatter(matterId);
      if (!resolved) return json({ error: "Forbidden: no access to that matter" });
      return json({
        workflowId: await createWorkflow(actor, { title, type, promptMd, matterId: resolved }),
      });
    }
  );

  // --- Baked-in legal research (jurisdiction-gated). CourtListener is US-only. ---
  if (providerIds.has("courtlistener")) {
    server.registerTool(
      "search_case_law",
      {
        description:
          "Search US case law opinions (CourtListener) by keyword, with optional court/date filters.",
        inputSchema: {
          query: z.string(),
          court: z.string().optional(),
          filedAfter: z.string().optional(),
          filedBefore: z.string().optional(),
          limit: z.number().optional(),
        },
      },
      async (args) => {
        try {
          return json(await searchCaseLaw(args));
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : "failed" });
        }
      }
    );

    server.registerTool(
      "verify_citations",
      {
        description:
          "Verify/normalize US reporter citations (e.g. '467 U.S. 837') against CourtListener.",
        inputSchema: { citations: z.array(z.string()) },
      },
      async ({ citations }) => {
        try {
          return json(await verifyCitations(citations));
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : "failed" });
        }
      }
    );
  }

  return server;
}
