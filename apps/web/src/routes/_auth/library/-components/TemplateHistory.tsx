import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/data/api";
import { Skeleton } from "@/components/ui/skeleton";

export function TemplateHistory({ id, head }: { id: string; head: string }) {
  const history = useQuery({
    queryKey: ["template-history", id, head],
    queryFn: () => api.templateHistory(id),
  });
  return (
    <details className="rounded-xl bg-muted/40 p-4">
      <summary className="cursor-pointer font-medium">Version and decision history</summary>
      <div className="mt-4 flex flex-col gap-3">
        {history.isPending ? (
          <Skeleton className="h-16" />
        ) : history.isError ? (
          <p role="alert" className="text-sm text-destructive">
            History could not be loaded.
          </p>
        ) : (
          history.data?.map((commit) => (
            <details key={commit.id} className="rounded-lg bg-card p-3 shadow-xs">
              <summary className="cursor-pointer text-sm">
                {commit.message}
                <span className="mt-1 block text-xs text-muted-foreground">
                  #{commit.seq} · {commit.actorName ?? commit.agentLabel ?? "Former member"} ·{" "}
                  {new Date(commit.createdAt).toLocaleString()}
                </span>
              </summary>
              <div className="mt-3 flex flex-col gap-3">
                {commit.changes.map((change) => (
                  <div key={change.path} className="text-xs">
                    <p className="font-medium">{change.path.replace("field/", "")}</p>
                    <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap">{`Before: ${formatChange(change.before)}\nAfter: ${formatChange(change.after)}`}</pre>
                  </div>
                ))}
              </div>
            </details>
          ))
        )}
      </div>
    </details>
  );
}

function formatChange(value: unknown): string {
  return value == null
    ? "—"
    : typeof value === "string"
      ? value
      : (JSON.stringify(value, null, 2) ?? "—");
}
