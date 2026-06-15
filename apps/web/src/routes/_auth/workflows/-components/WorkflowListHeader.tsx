import { Checkbox } from "@/components/ui/checkbox";

export function WorkflowListHeader({
  allSelected,
  someSelected,
  onToggleAll,
}: {
  allSelected: boolean;
  someSelected: boolean;
  onToggleAll: () => void;
}) {
  return (
    <div className="flex h-8 items-center border-b border-border pr-3 text-xs font-medium text-muted-foreground">
      <div className="flex w-[340px] shrink-0 items-center gap-3 pl-1">
        <Checkbox
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = someSelected;
          }}
          onChange={onToggleAll}
        />
        <span>Name</span>
      </div>
      <div className="ml-auto w-28 shrink-0">Type</div>
      <div className="w-40 shrink-0">Practice</div>
      <div className="w-32 shrink-0">Source</div>
      <div className="w-8 shrink-0" />
    </div>
  );
}
