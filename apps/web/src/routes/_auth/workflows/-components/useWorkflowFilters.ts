import { useMemo } from "react";
import type { WorkflowListItem } from "@/lib/api";
import type { WorkflowTab } from "./workflowList";

export function useWorkflowFilters({
  workflows,
  tab,
  search,
  practiceFilter,
  typeFilter,
}: {
  workflows: WorkflowListItem[];
  tab: WorkflowTab;
  search: string;
  practiceFilter: string | null;
  typeFilter: WorkflowListItem["type"] | null;
}) {
  const visibleBuiltins = workflows.filter((workflow) => workflow.isSystem && !workflow.hidden);
  const hiddenBuiltins = workflows.filter((workflow) => workflow.isSystem && workflow.hidden);
  const custom = workflows.filter((workflow) => !workflow.isSystem);
  const byTab =
    tab === "builtin"
      ? visibleBuiltins
      : tab === "custom"
        ? custom
        : tab === "hidden"
          ? hiddenBuiltins
          : [...visibleBuiltins, ...custom];

  const practices = useMemo(
    () =>
      Array.from(
        new Set(byTab.map((workflow) => workflow.practice).filter((item): item is string => !!item))
      ).sort(),
    [byTab]
  );

  const q = search.toLowerCase();
  const filtered = byTab
    .filter((workflow) => !practiceFilter || workflow.practice === practiceFilter)
    .filter((workflow) => !typeFilter || workflow.type === typeFilter)
    .filter((workflow) => !q || workflow.title.toLowerCase().includes(q));

  return { visibleBuiltins, hiddenBuiltins, custom, filtered, practices };
}
