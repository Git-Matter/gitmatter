import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api, type ChatDetail } from "@/lib/data/api";
import { queryKeys } from "@/lib/data/queries";
import { canRetainSnapshotAfterError } from "@/lib/data/snapshot-refresh";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function SavedConversation({
  id,
  matterId,
  children,
}: {
  id: string;
  matterId?: string;
  children: (chat: ChatDetail, current: boolean) => ReactNode;
}) {
  const query = useQuery({
    queryKey: queryKeys.chat(id),
    queryFn: () => api.getChat(id),
    retry: false,
    refetchOnMount: "always",
  });
  const [openedId, setOpenedId] = useState<string | null>(null);
  const initialReady = !!query.data && !query.isFetching && !query.error;
  useEffect(() => {
    if (initialReady) setOpenedId(id);
  }, [id, initialReady]);
  if (query.isPending) return <p role="status">Loading conversation…</p>;
  const unavailable =
    !query.data ||
    query.data.id !== id ||
    (openedId !== id && !!query.error) ||
    (!!query.error && !canRetainSnapshotAfterError(query.error));
  const mismatched = query.data && matterId !== undefined && query.data.matterId !== matterId;
  if (unavailable || mismatched)
    return (
      <Alert>
        <AlertTitle>
          {mismatched
            ? "This conversation belongs to a different context"
            : "Conversation unavailable"}
        </AlertTitle>
        <AlertDescription>
          {mismatched
            ? "Return to the conversation's original workspace or open a new conversation in this matter."
            : "The saved conversation could not be loaded. Retry to recover it, or deliberately start a new conversation."}
          <div className="mt-3 flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => void query.refetch()}>
              Retry conversation
            </Button>
            {matterId ? (
              <Link to="/matters/$id/assistant" params={{ id: matterId }}>
                New matter conversation
              </Link>
            ) : (
              <Link to="/assistant">New conversation</Link>
            )}
          </div>
        </AlertDescription>
      </Alert>
    );
  if (openedId !== id && !initialReady) return <p role="status">Loading current conversation…</p>;
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {query.error && (
        <Alert>
          <AlertTitle>Conversation could not be refreshed</AlertTitle>
          <AlertDescription>
            Your open conversation and draft are retained. Refresh it before sending another
            request.
            <Button variant="outline" className="mt-3 w-fit" onClick={() => void query.refetch()}>
              Retry conversation refresh
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <div className="min-h-0 flex-1">{children(query.data!, !query.error)}</div>
    </div>
  );
}
