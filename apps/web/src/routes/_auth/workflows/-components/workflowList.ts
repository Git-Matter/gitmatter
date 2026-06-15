import { MessageSquare, Table2 } from "lucide-react";
import type { WorkflowListItem } from "@/lib/api";

export type WorkflowTab = "all" | "builtin" | "custom" | "hidden";

export const WORKFLOW_TABS: { id: WorkflowTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "builtin", label: "Built-in" },
  { id: "custom", label: "Custom" },
  { id: "hidden", label: "Hidden" },
];

export function workflowTypeMeta(type: WorkflowListItem["type"]) {
  return type === "tabular"
    ? { label: "Tabular", Icon: Table2 }
    : { label: "Assistant", Icon: MessageSquare };
}
