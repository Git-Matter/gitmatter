import { Link } from "@tanstack/react-router";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";

// Shared full-page fallback for the root route's notFound / error boundaries.
// Kept dependency-light (no providers, no queries) so it renders even when the
// app shell or a loader has blown up.
export function ErrorState({
  code,
  title,
  message,
  onRetry,
}: {
  code: string;
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Empty className="min-h-[60vh]">
      <EmptyHeader>
        <p className="text-sm text-muted-foreground">{code}</p>
        <EmptyTitle>
          <h1>{title}</h1>
        </EmptyTitle>
        <EmptyDescription>{message}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center">
        {onRetry && (
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        )}
        <Button render={<Link to="/">Go home</Link>} />
      </EmptyContent>
    </Empty>
  );
}
