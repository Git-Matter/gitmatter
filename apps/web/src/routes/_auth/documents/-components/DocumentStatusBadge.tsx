import type { Doc } from "@/lib/data/api";
import { Badge } from "@/components/ui/badge";

const states = {
  pending: { label: "Queued", variant: "secondary" },
  processing: { label: "Extracting…", variant: "warning" },
  ready: { label: "Ready", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
} as const;
export function DocumentStatusBadge({ status }: { status: Doc["status"] }) {
  const state = states[status];
  return <Badge variant={state.variant}>{state.label}</Badge>;
}
