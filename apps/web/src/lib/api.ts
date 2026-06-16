export type {
  LlmModel,
  LlmProvider,
  ModelCapabilities,
  OpenRouterModel,
  ProviderCatalog,
  ProviderKeyStatus,
} from "@workspace/contracts";
import type {
  LlmProvider,
  OpenRouterModel,
  ProviderCatalog,
  ProviderKeyStatus,
} from "@workspace/contracts";

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

export type CellCitation = { page?: number; quote: string };

export type Cell = {
  id: string;
  documentId: string;
  columnIndex: number;
  content: CellContent | null;
  citations: CellCitation[] | null;
  status: "pending" | "generating" | "done" | "error";
  lastCommitId: string | null;
  blame: Blame | null;
};

export type Column = {
  index: number;
  name: string;
  prompt: string;
  format?: string;
  tags?: string[];
};

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
  practiceArea: string | null;
  jurisdiction: string | null;
  status: "open" | "closed";
  adverseParties: string[] | null;
  conflictCleared: boolean;
  conflictNotes: string | null;
  leadAttorney: string | null;
  createdAt: string;
  updatedAt: string;
};

// listMattersForUser joins matter + client + the caller's role, plus the owner's
// name and how many people have access (for the Projects-style list).
export type MatterListItem = {
  matter: Matter;
  client: Client;
  role: MatterRole;
  ownerName: string | null;
  memberCount: number;
};

// getClientOverview: the client plus the work the caller can see under it.
export type ClientOverview = {
  client: Client;
  matters: Array<{ matter: Matter; role: MatterRole }>;
  documents: Array<{
    id: string;
    title: string;
    fileType: string;
    status: DocStatus;
    matterId: string;
    createdAt: string;
  }>;
  reviews: Array<{ id: string; title: string; matterId: string; createdAt: string }>;
};

export type MatterMember = {
  userId: string;
  role: MatterRole;
  addedAt: string;
  name: string;
  email: string;
};

export type FirmUser = { id: string; name: string; email: string };

// A context item the user attaches to a chat message. The backend prepends a
// reference line so the model reads it via the tool catalog (fetch/get_review/…).
export type ChatAttachment = {
  kind: "document" | "matter" | "client" | "review";
  id: string;
  label: string;
};

// Thinking effort for reasoning-capable models. Undefined = "Instant" (off).
export type ReasoningEffort = "low" | "medium" | "high";

export type Citation = {
  ref: number;
  doc_id?: string;
  quotes?: string[];
  cluster_id?: number;
  opinion_id?: number;
};

export type DocStatus = "pending" | "processing" | "ready" | "failed";
export type Doc = {
  id: string;
  title: string;
  fileType: string;
  status: DocStatus;
  extractionError: string | null;
  sizeBytes: number | null;
  folderId: string | null;
  currentVersionId: string | null;
  createdAt: string;
  matterId: string | null;
  matterName: string | null;
  versionNumber: number | null;
};

export type PageResult<T> = {
  rows: T[];
  rowCount: number;
};

export type ListPageParams = {
  q?: string;
  status?: string;
  page: number;
  pageSize: number;
  sort?: string;
  dir?: "asc" | "desc";
};

// A bulk client selection: explicit ids, or "all matching the current filter".
export type ClientSelection = { ids: string[] } | { all: true; q?: string; status?: string };

function selectionQuery(sel: ClientSelection): string {
  const search = new URLSearchParams();
  if ("all" in sel) {
    search.set("all", "1");
    if (sel.q?.trim()) search.set("q", sel.q.trim());
    if (sel.status && sel.status !== "all") search.set("status", sel.status);
  } else {
    search.set("ids", sel.ids.join(","));
  }
  return search.toString();
}

export type DocVersion = {
  id: string;
  documentId: string;
  versionNumber: number;
  source: string;
  sizeBytes: number | null;
  fileType: string;
  deletedAt: string | null;
  createdAt: string;
};

export type Folder = {
  id: string;
  matterId: string;
  parentFolderId: string | null;
  name: string;
  createdAt: string;
};

export type TenantInvite = {
  id: string;
  email: string;
  token: string;
  role: "admin" | "member";
  acceptedAt: string | null;
  expiresAt: string;
  createdAt: string;
};

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!r.ok) throw await httpError(r);
  if (r.status === 204) return null as T;
  return (await r.json()) as T;
}

function listQuery(params: ListPageParams): string {
  const search = new URLSearchParams();
  search.set("page", String(params.page));
  search.set("pageSize", String(params.pageSize));
  if (params.q?.trim()) search.set("q", params.q.trim());
  if (params.status && params.status !== "all") search.set("status", params.status);
  if (params.sort) search.set("sort", params.sort);
  if (params.dir) search.set("dir", params.dir);
  return search.toString();
}

// statusText is empty over HTTP/2, so always fall back to the status code.
async function httpError(r: Response): Promise<Error> {
  const body = (await r.json().catch(() => ({}))) as { error?: string };
  return new Error(body.error || r.statusText || `Request failed (${r.status})`);
}

// Multipart upload — let the browser set the multipart boundary (no JSON header).
async function upload<T>(path: string, form: FormData): Promise<T> {
  const r = await fetch(path, { method: "POST", body: form });
  if (!r.ok) throw await httpError(r);
  return (await r.json()) as T;
}

export const api = {
  getKeys: () => req<{ providers: ProviderKeyStatus[] }>("/api/keys"),
  setKey: (provider: LlmProvider, key: string) =>
    req<{ ok: true }>("/api/keys", { method: "PUT", body: JSON.stringify({ provider, key }) }),
  deleteKey: (provider: LlmProvider) =>
    req<{ ok: true }>(`/api/keys?provider=${provider}`, { method: "DELETE" }),
  listModels: () => req<ProviderCatalog[]>("/api/models"),
  searchOpenRouterModels: (q: string) =>
    req<OpenRouterModel[]>(`/api/models/openrouter?q=${encodeURIComponent(q)}`),
  // Clients & matters (firm organization)
  listClients: () => req<Client[]>("/api/clients"),
  listClientsPage: (params: ListPageParams) =>
    req<PageResult<Client>>(`/api/clients?${listQuery(params)}`),
  getClient: (id: string) => req<ClientOverview>(`/api/clients/${id}`),
  bulkDeleteClients: (sel: ClientSelection) =>
    req<{ deleted: number; skipped: number }>("/api/clients/bulk-delete", {
      method: "POST",
      body: JSON.stringify(sel),
    }),
  clientsExportUrl: (sel: ClientSelection) => `/api/clients/export?${selectionQuery(sel)}`,
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
    practiceArea?: string;
    adverseParties?: string[];
  }) => req<Matter>("/api/matters", { method: "POST", body: JSON.stringify(d) }),
  closeMatter: (id: string) => req<null>(`/api/matters/${id}/close`, { method: "POST" }),
  updateMatter: (
    id: string,
    fields: {
      clientId?: string;
      name?: string;
      practiceArea?: string | null;
      jurisdiction?: string | null;
      status?: "open" | "closed";
      conflictCleared?: boolean;
      conflictNotes?: string | null;
    }
  ) => req<Matter>(`/api/matters/${id}`, { method: "PATCH", body: JSON.stringify(fields) }),
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
  addMemberByEmail: (id: string, email: string, role: MatterRole = "editor") =>
    req<FirmUser>(`/api/matters/${id}/members/by-email`, {
      method: "POST",
      body: JSON.stringify({ email, role }),
    }),
  getMatterPeople: (id: string) => req<MatterMember[]>(`/api/matters/${id}/people`),
  searchUsers: (q: string) => req<FirmUser[]>(`/api/users/search?q=${encodeURIComponent(q)}`),

  // Document folders (per matter)
  listFolders: (matterId: string) => req<Folder[]>(`/api/matters/${matterId}/folders`),
  createFolder: (matterId: string, name: string, parentFolderId?: string | null) =>
    req<Folder>(`/api/matters/${matterId}/folders`, {
      method: "POST",
      body: JSON.stringify({ name, parentFolderId }),
    }),
  renameFolder: (matterId: string, folderId: string, name: string) =>
    req<null>(`/api/matters/${matterId}/folders/${folderId}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  deleteFolder: (matterId: string, folderId: string) =>
    req<null>(`/api/matters/${matterId}/folders/${folderId}`, { method: "DELETE" }),

  // Tenant invites (admins)
  getTenant: () => req<{ id: string; name: string }>("/api/tenant"),
  listInvites: () => req<TenantInvite[]>("/api/tenant/invites"),
  createInvite: (email: string, role: "admin" | "member" = "member") =>
    req<TenantInvite>("/api/tenant/invites", {
      method: "POST",
      body: JSON.stringify({ email, role }),
    }),
  revokeInvite: (id: string) => req<null>(`/api/tenant/invites/${id}`, { method: "DELETE" }),

  listDocuments: () => req<Doc[]>("/api/documents"),
  listDocumentsPage: (params: ListPageParams) =>
    req<PageResult<Doc>>(`/api/documents?${listQuery(params)}`),
  listMatterDocuments: (matterId: string, folderId?: string | null) => {
    const f = folderId === undefined ? "" : `&folderId=${folderId === null ? "root" : folderId}`;
    return req<Doc[]>(`/api/documents?matterId=${matterId}${f}`);
  },
  listDocVersions: (id: string) => req<DocVersion[]>(`/api/documents/${id}/versions`),
  uploadDocumentVersion: (id: string, file: File) => {
    const f = new FormData();
    f.append("file", file);
    return upload<Doc>(`/api/documents/${id}/versions`, f);
  },
  deleteDocVersion: (id: string, versionId: string) =>
    req<null>(`/api/documents/${id}/versions/${versionId}`, { method: "DELETE" }),
  versionDownloadUrl: (id: string, versionId: string) =>
    `/api/documents/${id}/versions/${versionId}/download`,
  createDocument: (d: {
    title: string;
    markdown: string;
    matterId?: string;
    folderId?: string | null;
  }) => req<Doc>("/api/documents", { method: "POST", body: JSON.stringify(d) }),
  uploadDocument: (file: File, title?: string, matterId?: string, folderId?: string | null) => {
    const f = new FormData();
    f.append("file", file);
    if (title) f.append("title", title);
    if (matterId) f.append("matterId", matterId);
    if (folderId) f.append("folderId", folderId);
    return upload<Doc>("/api/documents/upload", f);
  },
  linkDocumentsToMatter: (matterId: string, documentIds: string[]) =>
    req<{ linked: number }>("/api/documents/link", {
      method: "POST",
      body: JSON.stringify({ matterId, documentIds }),
    }),
  retryDocument: (id: string) => req<Doc>(`/api/documents/${id}/retry`, { method: "POST" }),
  deleteDocument: (id: string) => req<null>(`/api/documents/${id}`, { method: "DELETE" }),
  listReviews: () =>
    req<Array<{ id: string; title: string; documentIds: string[]; createdAt: string }>>(
      "/api/tabular/reviews"
    ),
  listReviewsPage: (params: ListPageParams) =>
    req<PageResult<{ id: string; title: string; documentIds: string[]; createdAt: string }>>(
      `/api/tabular/reviews?${listQuery(params)}`
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
  // Streaming "Run all": docs run in parallel; cells fill in via handlers.
  runReviewStream: (
    id: string,
    opts: { model?: string },
    handlers: ReviewRunHandlers,
    signal?: AbortSignal
  ) => streamReviewRun(id, opts, handlers, signal),
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

  // Document redline (tracked changes)
  getDocumentDetail: (id: string) => req<DocumentDetail>(`/api/documents/${id}`),
  renameDocument: (id: string, title: string) =>
    req<DocumentDetail>(`/api/documents/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }),
  proposeEdit: (id: string, d: { find: string; replace: string; reason?: string }) =>
    req<DocumentDetail>(`/api/documents/${id}/edits`, { method: "POST", body: JSON.stringify(d) }),
  resolveEdit: (id: string, changeId: string, decision: "accept" | "reject") =>
    req<DocumentDetail>(`/api/documents/${id}/edits/${changeId}/resolve`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    }),
  resolveAllEdits: (id: string, decision: "accept" | "reject") =>
    req<DocumentDetail>(`/api/documents/${id}/edits/resolve-all`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    }),
  resolveBatch: (id: string, changeIds: string[], decision: "accept" | "reject") =>
    req<DocumentDetail>(`/api/documents/${id}/edits/resolve-batch`, {
      method: "POST",
      body: JSON.stringify({ changeIds, decision }),
    }),
  documentHistory: (id: string) => req<Blame[]>(`/api/documents/${id}/history`),

  // Workflows
  listWorkflows: () => req<WorkflowListItem[]>("/api/workflows"),
  listWorkflowsPage: (params: ListPageParams & { source?: string }) => {
    const search = listQuery(params);
    const source = params.source && params.source !== "all" ? `&source=${params.source}` : "";
    return req<PageResult<{ id: string; title: string; type: string; isSystem: boolean }>>(
      `/api/workflows?${search}${source}`
    );
  },
  createWorkflow: (d: {
    title: string;
    type: "assistant" | "tabular";
    promptMd?: string;
    columnsConfig?: Column[];
    practice?: string | null;
    matterId?: string;
  }) => req<WorkflowDetail>("/api/workflows", { method: "POST", body: JSON.stringify(d) }),
  getWorkflow: (id: string) => req<WorkflowDetail>(`/api/workflows/${id}`),
  updateWorkflow: (
    id: string,
    patch: {
      title?: string;
      promptMd?: string;
      steps?: WorkflowStep[] | null;
      columnsConfig?: Column[];
      practice?: string | null;
    }
  ) =>
    req<WorkflowDetail>(`/api/workflows/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteWorkflow: (id: string) => req<null>(`/api/workflows/${id}`, { method: "DELETE" }),
  workflowHistory: (id: string) => req<Blame[]>(`/api/workflows/${id}/history`),
  // Hidden built-ins (per user)
  listHiddenWorkflows: () => req<string[]>("/api/workflows/hidden"),
  hideWorkflow: (workflowId: string) =>
    req<null>("/api/workflows/hidden", {
      method: "POST",
      body: JSON.stringify({ workflowId }),
    }),
  unhideWorkflow: (workflowId: string) =>
    req<null>(`/api/workflows/hidden/${workflowId}`, { method: "DELETE" }),
  // Sharing
  listWorkflowShares: (id: string) => req<WorkflowShare[]>(`/api/workflows/${id}/shares`),
  shareWorkflow: (id: string, d: { emails: string[]; allowEdit: boolean }) =>
    req<WorkflowShare[]>(`/api/workflows/${id}/share`, {
      method: "POST",
      body: JSON.stringify(d),
    }),
  deleteWorkflowShare: (id: string, shareId: string) =>
    req<null>(`/api/workflows/${id}/shares/${shareId}`, { method: "DELETE" }),
  // Draft a column extraction prompt from its title/format/tags.
  generateColumnPrompt: (d: { title: string; format?: string; tags?: string[] }) =>
    req<{ prompt: string }>("/api/tabular/prompt", {
      method: "POST",
      body: JSON.stringify(d),
    }),

  // Chat (consumes the shared gitcounsel tool catalog + external MCP tools)
  sendChat: (
    message: string,
    opts?: {
      model?: string;
      attachments?: ChatAttachment[];
      reasoning?: ReasoningEffort;
    }
  ) =>
    req<{
      text: string;
      toolCalls: Array<{ tool: string; input: unknown }>;
      tools: string[];
      jurisdiction: string;
      documents: Array<{ id: string; title: string; download: string }>;
      citations: Citation[];
    }>("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message, ...opts }),
    }),
  // Streaming variant: token deltas arrive via handlers, the final payload via
  // onDone. Same request body as sendChat.
  streamChat: (
    message: string,
    opts: ChatSendOpts,
    handlers: ChatStreamHandlers,
    signal?: AbortSignal
  ) => streamChat(message, opts, handlers, signal),
  // Conversation history. `matterId` scopes to a matter's chats; omitted lists
  // the global (unscoped) assistant chats.
  listChats: (matterId?: string) =>
    req<ChatSummary[]>(`/api/chats${matterId ? `?matterId=${matterId}` : ""}`),
  // Every chat (global + matter-scoped) for the ChatGPT-style sidebar.
  listAllChats: () => req<ChatSummary[]>(`/api/chats?scope=all`),
  setChatPinned: (id: string, pinned: boolean) =>
    req<{ ok: true }>(`/api/chats/${id}/pin`, {
      method: "PATCH",
      body: JSON.stringify({ pinned }),
    }),
  getChat: (id: string) => req<ChatDetail>(`/api/chats/${id}`),
  documentDownloadUrl: (id: string) => `/api/documents/${id}/download`,
};

export type ChatSendOpts = {
  model?: string;
  attachments?: ChatAttachment[];
  reasoning?: ReasoningEffort;
  chatId?: string;
  // Scope a new chat to a matter (matter workspace). Ignored when chatId is set.
  matterId?: string;
};

// A tracked change touched by an assistant turn, rendered as a chat card.
export type ChatEdit = {
  documentId: string;
  changeId: string;
  deletedText: string | null;
  insertedText: string | null;
  reason: string | null;
  status: "pending" | "accepted" | "rejected";
};

export type ChatResult = {
  chatId: string;
  text: string;
  toolCalls: Array<{ tool: string; input: unknown }>;
  tools: string[];
  jurisdiction: string;
  documents: Array<{ id: string; title: string; download: string }>;
  edits: ChatEdit[];
  citations: Citation[];
};

export type ChatSummary = {
  id: string;
  title: string | null;
  updatedAt: string;
  matterId: string | null;
  pinned: boolean;
};
export type ChatTurn = {
  role: "user" | "assistant";
  text: string;
  toolCalls?: Array<{ tool: string; input: unknown }>;
  edits?: ChatEdit[];
  citations?: Citation[];
};
export type ChatDetail = { id: string; title: string | null; turns: ChatTurn[] };

export type ChatStreamHandlers = {
  onText?: (delta: string) => void;
  onReasoning?: (delta: string) => void;
  onTool?: (name: string, input?: unknown) => void;
  onDone?: (result: ChatResult) => void;
  onError?: (message: string) => void;
};

// A cell as it streams back from a "Run all" — the fields needed to fill the
// grid; blame/history arrive on the post-run refetch.
export type ReviewStreamCell = {
  documentId: string;
  columnIndex: number;
  content: CellContent | null;
  citations: CellCitation[] | null;
  status: Cell["status"];
};

export type ReviewRunHandlers = {
  onCellStart?: (documentId: string, columnIndex: number) => void;
  onCell?: (documentId: string, columnIndex: number, cell: ReviewStreamCell) => void;
  onError?: (documentId: string | null, columnIndex: number | null, message: string) => void;
  onDone?: () => void;
};

// Drives the streaming "Run all" — same SSE-over-fetch parsing as streamChat,
// dispatching per-document progress.
async function streamReviewRun(
  id: string,
  opts: { model?: string },
  handlers: ReviewRunHandlers,
  signal?: AbortSignal
): Promise<void> {
  const r = await fetch(`/api/tabular/reviews/${id}/run-all`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
    signal,
  });
  if (!r.ok || !r.body) {
    handlers.onError?.(null, null, await r.text().catch(() => "run failed"));
    return;
  }
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const dispatch = (event: string, data: string) => {
    const v = data ? (JSON.parse(data) as Record<string, unknown>) : {};
    if (event === "cell-start")
      handlers.onCellStart?.(v.documentId as string, v.columnIndex as number);
    else if (event === "cell")
      handlers.onCell?.(
        v.documentId as string,
        v.columnIndex as number,
        v.cell as ReviewStreamCell
      );
    else if (event === "error")
      handlers.onError?.(
        (v.documentId as string) ?? null,
        (v.columnIndex as number) ?? null,
        v.message as string
      );
    else if (event === "done") handlers.onDone?.();
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        let event = "message";
        let data = "";
        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data += line.slice(5).trim();
        }
        if (data) dispatch(event, data);
      }
    }
  } catch (err) {
    if ((err as Error)?.name !== "AbortError") throw err;
  } finally {
    reader.cancel().catch(() => {});
  }
}

// POSTs to the SSE chat endpoint and dispatches events to handlers. Parses the
// text/event-stream frames off the response body (fetch, not EventSource, so we
// can POST with the session cookie).
async function streamChat(
  message: string,
  opts: ChatSendOpts,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal
): Promise<void> {
  const r = await fetch("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, ...opts }),
    // Abort closes the connection and unblocks reader.read() so the loop, the
    // response body, and every captured handler closure can be GC'd when the
    // caller (e.g. a chat view) unmounts mid-stream.
    signal,
  });
  if (!r.ok || !r.body) {
    handlers.onError?.(await r.text().catch(() => "stream failed"));
    return;
  }

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const dispatch = (event: string, data: string) => {
    const value = data ? (JSON.parse(data) as unknown) : null;
    if (event === "text") handlers.onText?.(value as string);
    else if (event === "reasoning") handlers.onReasoning?.(value as string);
    else if (event === "tool") {
      const v = value as { name: string; input?: unknown };
      handlers.onTool?.(v.name, v.input);
    } else if (event === "done") handlers.onDone?.(value as ChatResult);
    else if (event === "error") handlers.onError?.(value as string);
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by a blank line.
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        let event = "message";
        let data = "";
        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data += line.slice(5).trim();
        }
        if (data) dispatch(event, data);
      }
    }
  } catch (err) {
    // A caller-triggered abort is expected cleanup, not an error to surface.
    if ((err as Error)?.name !== "AbortError") throw err;
  } finally {
    // Release the lock so the body stream can be collected even if we broke early.
    reader.cancel().catch(() => {});
  }
}

export type DocEdit = {
  id: string;
  changeId: string;
  deletedText: string | null;
  insertedText: string | null;
  reason: string | null;
  status: "pending" | "accepted" | "rejected";
  blame: Blame | null;
};

export type DocumentDetail = {
  document: {
    id: string;
    title: string;
    fileType: string;
    markdown: string | null;
    status: DocStatus;
    headCommitId: string | null;
    currentVersionId: string | null;
    sizeBytes: number | null;
    pageCount: number | null;
    createdAt: string;
    ownerName: string | null;
    ownerEmail: string | null;
  };
  edits: DocEdit[];
};

// A row in the workflows library list (built-ins + own + shared), tagged with
// the viewer's access flags so the UI can render Source/owner and gate actions.
// One step of a multi-step assistant workflow (runs as its own chat turn, in order).
export type WorkflowStep = { title?: string; promptMd: string };

export type WorkflowListItem = {
  id: string;
  title: string;
  type: "assistant" | "tabular";
  promptMd: string;
  steps: WorkflowStep[] | null;
  columnsConfig: Column[] | null;
  practice: string | null;
  isSystem: boolean;
  isOwner: boolean;
  allowEdit: boolean;
  sharedByName: string | null;
  hidden: boolean;
  userId: string | null;
  createdAt: string;
};

export type WorkflowShare = {
  id: string;
  sharedWithEmail: string;
  allowEdit: boolean;
  createdAt: string;
};

export type WorkflowAccess = {
  isOwner: boolean;
  allowEdit: boolean;
  sharedByName: string | null;
  canView: boolean;
  canEdit: boolean;
};

export type WorkflowDetail = {
  workflow: {
    id: string;
    title: string;
    type: "assistant" | "tabular";
    promptMd: string;
    steps: WorkflowStep[] | null;
    columnsConfig: Column[] | null;
    practice: string | null;
    isSystem: boolean;
    isOwner: boolean;
    allowEdit: boolean;
    sharedByName: string | null;
    matterId: string | null;
  };
  blame: Record<string, Blame | null>;
  access: WorkflowAccess;
};
