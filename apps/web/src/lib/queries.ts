import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

// Shared query hooks. Query keys are centralized here so loaders (via
// queryClient.ensureQueryData) and components hit the same cache entry.

export const queryKeys = {
  models: ["models"] as const,
  matters: ["matters"] as const,
  documents: ["documents"] as const,
  documentsPage: (params: unknown) => ["documents", "page", params] as const,
  clients: ["clients"] as const,
  clientsPage: (params: unknown) => ["clients", "page", params] as const,
  reviews: ["reviews"] as const,
  reviewsPage: (params: unknown) => ["reviews", "page", params] as const,
  workflows: ["workflows"] as const,
  workflowsPage: (params: unknown) => ["workflows", "page", params] as const,
  chats: ["chats"] as const,
  allChats: ["chats", "all"] as const,
  matterChats: (matterId: string) => ["chats", "matter", matterId] as const,
  chat: (id: string) => ["chat", id] as const,
  client: (id: string) => ["client", id] as const,
};

// Conversation list for the sidebar. Client-side (react-query) like the other
// lists — a route loader would fetch with a relative URL that fails under SSR.
export function useChats(matterId?: string) {
  return useQuery({
    queryKey: matterId ? queryKeys.matterChats(matterId) : queryKeys.chats,
    queryFn: () => api.listChats(matterId),
  });
}

// Every conversation (global + matter-scoped) for the ChatGPT-style sidebar.
export function useAllChats() {
  return useQuery({
    queryKey: queryKeys.allChats,
    queryFn: () => api.listAllChats(),
  });
}

// Pin/unpin a chat. Invalidates every chat list so the sidebar (all), the global
// list, and the matter-scoped list all re-sort.
export function useSetChatPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; pinned: boolean }) => api.setChatPinned(v.id, v.pinned),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["chats"] });
    },
  });
}

// Document + client lists, shared by their routes and the sidebar's recent
// panels. Same cache entry as the route loaders/components.
export function useDocuments() {
  return useQuery({
    queryKey: queryKeys.documents,
    queryFn: () => api.listDocuments(),
  });
}

export function useClients() {
  return useQuery({
    queryKey: queryKeys.clients,
    queryFn: () => api.listClients(),
  });
}

// The provider catalog is fetched by both pickers in the composer; react-query
// dedupes the two mounts into one request and caches it.
export function useModelCatalog() {
  return useQuery({
    queryKey: queryKeys.models,
    queryFn: () => api.listModels(),
  });
}
