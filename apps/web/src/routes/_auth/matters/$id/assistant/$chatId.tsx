import { createFileRoute } from "@tanstack/react-router";
import { MatterChatWorkspace } from "@/routes/_auth/matters/-components/MatterChatWorkspace";
import { SavedConversation } from "@/routes/_auth/assistant/-components/SavedConversation";

// Resume a matter-scoped conversation. Fetched client-side (react-query) rather
// than in a route loader — a loader fetches with a relative URL that fails under
// SSR/hard-reload (same pattern as /assistant/$id).
export const Route = createFileRoute("/_auth/matters/$id/assistant/$chatId")({
  component: ResumeMatterChat,
});

function ResumeMatterChat() {
  const { id, chatId } = Route.useParams();
  return (
    <SavedConversation id={chatId} matterId={id}>
      {(loaded, current) => (
        <MatterChatWorkspace key={chatId} matterId={id} loaded={loaded} current={current} />
      )}
    </SavedConversation>
  );
}
