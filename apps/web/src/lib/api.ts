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

export type MatterRole = "owner" | "editor" | "viewer";

export type Client = {
  id: string;
  name: string;
  type: "organization" | "individual";
  clientNumber: string | null;
  status: "active" | "inactive";
  createdAt: string;
};

export type Matter = {
  id: string;
  clientId: string;
  name: string;
  matterNumber: string | null;
  practiceArea: string | null;
  status: "active" | "closed";
  adverseParties: string[] | null;
  conflictCleared: boolean;
  conflictNotes: string | null;
  leadAttorney: string | null;
  createdAt: string;
  updatedAt: string;
};

// listMattersForUser joins matter + client + the caller's role.
export type MatterListItem = { matter: Matter; client: Client; role: MatterRole };

export type MatterMember = {
  userId: string;
  role: MatterRole;
  addedAt: string;
  name: string;
  email: string;
};

export type FirmUser = { id: string; name: string; email: string };

export type Citation = {
  ref: number;
  doc_id?: string;
  quotes?: string[];
  cluster_id?: number;
  opinion_id?: number;
};

export type LlmProvider = "anthropic" | "openai" | "gemini" | "openrouter";
export type LlmModel = { id: string; label: string; provider: LlmProvider };
export type ProviderStatus = {
  provider: LlmProvider;
  hasUserKey: boolean;
  source: "user" | "env" | null;
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
  getKeys: () => req<{ providers: ProviderStatus[] }>("/api/keys"),
  setKey: (provider: LlmProvider, key: string) =>
    req<{ ok: true }>("/api/keys", { method: "PUT", body: JSON.stringify({ provider, key }) }),
  deleteKey: (provider: LlmProvider) =>
    req<{ ok: true }>(`/api/keys?provider=${provider}`, { method: "DELETE" }),
  listModels: () => req<LlmModel[]>("/api/models"),
  // Clients & matters (firm organization)
  listClients: () => req<Client[]>("/api/clients"),
  createClient: (d: {
    name: string;
    type?: "organization" | "individual";
    clientNumber?: string;
  }) => req<Client>("/api/clients", { method: "POST", body: JSON.stringify(d) }),
  listMatters: () => req<MatterListItem[]>("/api/matters"),
  getMatter: (id: string) => req<Matter>(`/api/matters/${id}`),
  createMatter: (d: {
    clientId: string;
    name: string;
    matterNumber?: string;
    practiceArea?: string;
    adverseParties?: string[];
  }) => req<Matter>("/api/matters", { method: "POST", body: JSON.stringify(d) }),
  closeMatter: (id: string) => req<null>(`/api/matters/${id}/close`, { method: "POST" }),
  clearConflicts: (id: string, notes?: string) =>
    req<null>(`/api/matters/${id}/clear-conflicts`, {
      method: "POST",
      body: JSON.stringify({ notes }),
    }),
  checkConflicts: (d: { clientName: string; adverseParties?: string[] }) =>
    req<{ matches: string[] }>("/api/matters/conflicts-check", {
      method: "POST",
      body: JSON.stringify(d),
    }),
  listMembers: (id: string) => req<MatterMember[]>(`/api/matters/${id}/members`),
  addMember: (id: string, userId: string, role: MatterRole) =>
    req<null>(`/api/matters/${id}/members`, {
      method: "POST",
      body: JSON.stringify({ userId, role }),
    }),
  removeMember: (id: string, userId: string) =>
    req<null>(`/api/matters/${id}/members/${userId}`, { method: "DELETE" }),
  searchUsers: (q: string) => req<FirmUser[]>(`/api/users/search?q=${encodeURIComponent(q)}`),

  listDocuments: () => req<Doc[]>("/api/documents"),
  createDocument: (d: { title: string; markdown: string; matterId?: string }) =>
    req<Doc>("/api/documents", { method: "POST", body: JSON.stringify(d) }),
  uploadDocument: (file: File, title?: string, matterId?: string) => {
    const f = new FormData();
    f.append("file", file);
    if (title) f.append("title", title);
    if (matterId) f.append("matterId", matterId);
    return upload<Doc>("/api/documents/upload", f);
  },
  retryDocument: (id: string) => req<Doc>(`/api/documents/${id}/retry`, { method: "POST" }),
  listReviews: () =>
    req<Array<{ id: string; title: string; documentIds: string[]; createdAt: string }>>(
      "/api/tabular/reviews"
    ),
  createReview: (d: {
    title: string;
    columnsConfig: Column[];
    documentIds: string[];
    matterId?: string;
  }) => req<{ id: string }>("/api/tabular/reviews", { method: "POST", body: JSON.stringify(d) }),
  getReview: (id: string) => req<ReviewDetail>(`/api/tabular/reviews/${id}`),
  runCell: (id: string, documentId: string, columnIndex: number, model?: string) =>
    req<ReviewDetail>(`/api/tabular/reviews/${id}/run`, {
      method: "POST",
      body: JSON.stringify({ documentId, columnIndex, model }),
    }),
  history: (id: string) => req<Blame[]>(`/api/tabular/reviews/${id}/history`),
  reviewExportUrl: (id: string, format: "csv" | "xlsx") =>
    `/api/tabular/reviews/${id}/export?format=${format}`,
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
  createContract: (d: {
    title: string;
    body: string;
    jurisdiction?: string | null;
    matterId?: string;
  }) => req<{ id: string }>("/api/contracts", { method: "POST", body: JSON.stringify(d) }),
  uploadContract: (file: File, title?: string, jurisdiction?: string | null, matterId?: string) => {
    const f = new FormData();
    f.append("file", file);
    if (title) f.append("title", title);
    if (jurisdiction) f.append("jurisdiction", jurisdiction);
    if (matterId) f.append("matterId", matterId);
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
  createWorkflow: (d: {
    title: string;
    type: "assistant" | "tabular";
    promptMd: string;
    matterId?: string;
  }) => req<{ id: string }>("/api/workflows", { method: "POST", body: JSON.stringify(d) }),
  getWorkflow: (id: string) => req<WorkflowDetail>(`/api/workflows/${id}`),
  updateWorkflow: (id: string, patch: { title?: string; promptMd?: string }) =>
    req<WorkflowDetail>(`/api/workflows/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  // Chat (consumes external MCP tools)
  sendChat: (message: string, model?: string) =>
    req<{
      text: string;
      toolCalls: Array<{ tool: string; input: unknown }>;
      tools: string[];
      jurisdiction: string;
      documents: Array<{ id: string; title: string; download: string }>;
      citations: Citation[];
    }>("/api/chat", { method: "POST", body: JSON.stringify({ message, model }) }),
  documentDownloadUrl: (id: string) => `/api/documents/${id}/download`,
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
