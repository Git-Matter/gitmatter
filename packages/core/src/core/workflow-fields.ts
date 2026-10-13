import type { WorkflowProposalFields } from "@workspace/contracts";
import type { Workflow } from "@workspace/db/schema";

const fields = [
  ["title", "field/title"],
  ["type", "field/type"],
  ["promptMd", "field/prompt_md"],
  ["steps", "field/steps"],
  ["columnsConfig", "field/columns_config"],
  ["rules", "field/rules"],
  ["status", "field/status"],
  ["practice", "field/practice"],
] as const;

export function workflowFields(
  workflow: Pick<Workflow, keyof WorkflowProposalFields>
): WorkflowProposalFields {
  return Object.fromEntries(fields.map(([key]) => [key, workflow[key]])) as WorkflowProposalFields;
}

export function workflowFieldChanges(
  before: WorkflowProposalFields | null,
  after: WorkflowProposalFields
) {
  return fields
    .filter(([key]) => JSON.stringify(before?.[key] ?? null) !== JSON.stringify(after[key]))
    .map(([key, path]) => ({ key, path, before: before?.[key] ?? null, after: after[key] }));
}
