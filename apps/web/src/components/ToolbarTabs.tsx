import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type ToolbarTab<T extends string> = { id: T; label: string };

/** Controlled filters shared by list pages and matter sections. */
export function ToolbarTabs<T extends string>({
  tabs,
  active,
  onChange,
  actions,
}: {
  tabs: ToolbarTab<T>[];
  active: T;
  onChange: (id: T) => void;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-grid-line pb-3">
      <ToggleGroup
        value={[active]}
        onValueChange={(values) => {
          if (values[0]) onChange(values[0] as T);
        }}
        aria-label="Filter view"
      >
        {tabs.map((tab) => (
          <ToggleGroupItem key={tab.id} value={tab.id}>
            {tab.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {actions && <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
