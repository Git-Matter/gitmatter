import { Search } from "lucide-react";

// The list-table search box: a bordered input with a leading icon, sized to sit
// in a toolbar/tabs row. Shared by every list page so the search affordance is
// identical everywhere.
export function TableSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-input bg-background px-2.5">
      <Search className="size-4 shrink-0 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-7 w-48 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
