export type Blame = {
  id: string;
  seq: number;
  op: string;
  message: string;
  actorType: "user" | "agent";
  agentLabel: string | null;
  createdAt: string;
};

export type CellContent = {
  summary: string;
  flag: "green" | "grey" | "yellow" | "red";
  reasoning: string;
};

export type Cell = {
  id: string;
  documentId: string;
  columnIndex: number;
  content: CellContent | null;
  status: "pending" | "generating" | "done" | "error";
  lastCommitId: string | null;
  blame: Blame | null;
};

export type Column = { index: number; name: string; prompt: string; format?: string };

export type ReviewDetail = {
  review: {
    id: string;
    title: string;
    columnsConfig: Column[];
    documentIds: string[];
    headCommitId: string | null;
  };
  cells: Cell[];
};

export type DocStatus = "pending" | "processing" | "ready" | "failed";
export type Doc = {
  id: string;
  title: string;
  fileType: string;
  status: DocStatus;
  extractionError: string | null;
  createdAt: string;
};

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || r.statusText);
  }
  if (r.status === 204) return null as T;
  return (await r.json()) as T;
}

// Multipart upload — let the browser set the multipart boundary (no JSON header).
async function upload<T>(path: string, form: FormData): Promise<T> {
  const r = await fetch(path, { method: "POST", body: form });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || r.statusText);
  }
  return (await r.json()) as T;
}

export const api = {
  getKeys: () => req<{ hasAnthropic: boolean }>("/api/keys"),
  setKey: (anthropicKey: string) =>
    req<{ hasAnthropic: boolean }>("/api/keys", {
      method: "PUT",
      body: JSON.stringify({ anthropicKey }),
    }),
  listDocuments: () => req<Doc[]>("/api/documents"),
  createDocument: (d: { title: string; markdown: string }) =>
    req<Doc>("/api/documents", { method: "POST", body: JSON.stringify(d) }),
  uploadDocument: (file: File, title?: string) => {
    const f = new FormData();
    f.append("file", file);
    if (title) f.append("title", title);
    return upload<Doc>("/api/documents/upload", f);
  },
  retryDocument: (id: string) => req<Doc>(`/api/documents/${id}/retry`, { method: "POST" }),
  listReviews: () =>
    req<Array<{ id: string; title: string; documentIds: string[]; createdAt: string }>>(
      "/api/tabular/reviews"
    ),
  createReview: (d: { title: string; columnsConfig: Column[]; documentIds: string[] }) =>
    req<{ id: string }>("/api/tabular/reviews", { method: "POST", body: JSON.stringify(d) }),
  getReview: (id: string) => req<ReviewDetail>(`/api/tabular/reviews/${id}`),
  runCell: (id: string, documentId: string, columnIndex: number) =>
    req<ReviewDetail>(`/api/tabular/reviews/${id}/run`, {
      method: "POST",
      body: JSON.stringify({ documentId, columnIndex }),
    }),
  history: (id: string) => req<Blame[]>(`/api/tabular/reviews/${id}/history`),
  listTokens: () =>
    req<
      Array<{
        id: string;
        label: string;
        createdAt: string;
        lastUsedAt: string | null;
        revokedAt: string | null;
      }>
    >("/api/mcp-tokens"),
  mintToken: (label: string) =>
    req<{ token: string }>("/api/mcp-tokens", { method: "POST", body: JSON.stringify({ label }) }),
  revokeToken: (id: string) => req<null>(`/api/mcp-tokens/${id}`, { method: "DELETE" }),

  // Account settings
  getSettings: () => req<{ jurisdiction: string | null }>("/api/settings"),
  setSettings: (jurisdiction: string | null) =>
    req<{ jurisdiction: string | null }>("/api/settings", {
      method: "PUT",
      body: JSON.stringify({ jurisdiction }),
    }),

  // Contracts
  listContracts: () =>
    req<Array<{ id: string; title: string; createdAt: string }>>("/api/contracts"),
  createContract: (d: { title: string; body: string; jurisdiction?: string | null }) =>
    req<{ id: string }>("/api/contracts", { method: "POST", body: JSON.stringify(d) }),
  uploadContract: (file: File, title?: string, jurisdiction?: string | null) => {
    const f = new FormData();
    f.append("file", file);
    if (title) f.append("title", title);
    if (jurisdiction) f.append("jurisdiction", jurisdiction);
    return upload<{ id: string }>("/api/contracts/upload", f);
  },
  contractDocxUrl: (id: string) => `/api/contracts/${id}/docx`,
  getContract: (id: string) => req<ContractDetail>(`/api/contracts/${id}`),
  proposeEdit: (id: string, d: { find: string; replace: string; reason?: string }) =>
    req<ContractDetail>(`/api/contracts/${id}/edits`, { method: "POST", body: JSON.stringify(d) }),
  resolveEdit: (id: string, changeId: string, decision: "accept" | "reject") =>
    req<ContractDetail>(`/api/contracts/${id}/edits/${changeId}/resolve`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    }),
  contractHistory: (id: string) => req<Blame[]>(`/api/contracts/${id}/history`),

  // Workflows
  listWorkflows: () =>
    req<Array<{ id: string; title: string; type: string; isSystem: boolean }>>("/api/workflows"),
  createWorkflow: (d: { title: string; type: "assistant" | "tabular"; promptMd: string }) =>
    req<{ id: string }>("/api/workflows", { method: "POST", body: JSON.stringify(d) }),
  getWorkflow: (id: string) => req<WorkflowDetail>(`/api/workflows/${id}`),
  updateWorkflow: (id: string, patch: { title?: string; promptMd?: string }) =>
    req<WorkflowDetail>(`/api/workflows/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  // Chat (consumes external MCP tools)
  sendChat: (message: string) =>
    req<{
      text: string;
      toolCalls: Array<{ tool: string; input: unknown }>;
      tools: string[];
      jurisdiction: string;
    }>("/api/chat", { method: "POST", body: JSON.stringify({ message }) }),
};

export type ContractEdit = {
  id: string;
  changeId: string;
  deletedText: string | null;
  insertedText: string | null;
  reason: string | null;
  status: "pending" | "accepted" | "rejected";
  blame: Blame | null;
};

export type ContractDetail = {
  contract: {
    id: string;
    title: string;
    body: string;
    headCommitId: string | null;
    currentVersionId: string | null;
  };
  edits: ContractEdit[];
};

export type WorkflowDetail = {
  workflow: {
    id: string;
    title: string;
    type: "assistant" | "tabular";
    promptMd: string;
    isSystem: boolean;
  };
  blame: Record<string, Blame | null>;
};
