// Where a workflow's full-page detail editor lives, keyed by type. Returns a
// TanStack Router nav target ({ to, params }) usable with Link and navigate().
export function workflowDetailRoute(workflow: { id: string; type: "assistant" | "tabular" }) {
  return workflow.type === "assistant"
    ? { to: "/workflows/assistant/$id" as const, params: { id: workflow.id } }
    : { to: "/workflows/tabular-review/$id" as const, params: { id: workflow.id } };
}
