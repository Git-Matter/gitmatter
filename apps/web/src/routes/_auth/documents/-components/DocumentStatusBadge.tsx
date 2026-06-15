import type { Doc } from "@/lib/api";

export function DocumentStatusBadge({ status }: { status: Doc["status"] }) {
  const map: Record<Doc["status"], { label: string; cls: string }> = {
    pending: { label: "Queued", cls: "bg-muted text-muted-foreground" },
    processing: { label: "Extracting...", cls: "bg-blue-100 text-blue-700" },
    ready: { label: "Ready", cls: "bg-green-100 text-green-700" },
    failed: { label: "Failed", cls: "bg-destructive-surface text-destructive" },
  };
  const { label, cls } = map[status];
  return <span className={`rounded px-1.5 py-0.5 text-xs ${cls}`}>{label}</span>;
}
