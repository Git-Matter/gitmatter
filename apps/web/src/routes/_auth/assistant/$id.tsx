import { createFileRoute, Navigate } from "@tanstack/react-router";
import { AssistantView } from "./index";
import { SavedConversation } from "./-components/SavedConversation";

// Resume a conversation. Fetched client-side (react-query) rather than in a route
// loader — a loader fetches with a relative URL that fails under SSR/hard-reload.
export const Route = createFileRoute("/_auth/assistant/$id")({
  component: ResumeChat,
});

function ResumeChat() {
  const { id } = Route.useParams();
  return (
    <SavedConversation id={id}>
      {(loaded, current) =>
        loaded.matterId ? (
          <Navigate
            to="/matters/$id/assistant/$chatId"
            params={{ id: loaded.matterId, chatId: id }}
            replace
          />
        ) : (
          <AssistantView key={id} loaded={loaded} current={current} />
        )
      }
    </SavedConversation>
  );
}
