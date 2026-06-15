import { createFileRoute } from "@tanstack/react-router";
import { WorkflowDetailPage } from "./workflows/-components/WorkflowDetailPage";

export const Route = createFileRoute("/_auth/workflows/tabular-review/$id")({
  component: TabularWorkflowDetail,
});

function TabularWorkflowDetail() {
  const { id } = Route.useParams();
  return <WorkflowDetailPage id={id} />;
}
