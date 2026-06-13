import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { AssistantView } from "./assistant";

// Resume a conversation. Fetched client-side (react-query) rather than in a route
// loader — a loader fetches with a relative URL that fails under SSR/hard-reload.
export const Route = createFileRoute("/_auth/assistant_/$id")({
  component: ResumeChat,
});

function ResumeChat() {
  const { id } = Route.useParams();
  // AssistantView seeds its turns from `loaded` at mount (it's keyed by id), so
  // wait for the fetch before mounting it.
  const { data: loaded, isPending } = useQuery({
    queryKey: ["chat", id],
    queryFn: () => api.getChat(id).catch(() => null),
  });
  if (isPending) return null;
  return <AssistantView key={id} loaded={loaded ?? null} />;
}
