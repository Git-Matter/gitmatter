import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Column } from "@/lib/data/api";

const COLUMN_FORMATS = [
  { value: "", label: "Free text" },
  { value: "yes_no", label: "Yes / No" },
  { value: "currency", label: "Currency" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "percentage", label: "Percentage" },
  { value: "tag", label: "Tag" },
  { value: "bulleted_list", label: "Bulleted list" },
] as const;

export function ReviewColumnEditor({
  columns,
  setColumns,
}: {
  columns: Column[];
  setColumns: React.Dispatch<React.SetStateAction<Column[]>>;
}) {
  function setCol(i: number, patch: Partial<Column>) {
    setColumns((cols) => cols.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Columns</Label>
      <div className="flex max-h-56 flex-col gap-2 overflow-y-auto">
        {columns.map((c, i) => (
          <div key={i} className="flex gap-2">
            <Input
              className="w-40"
              placeholder="Name"
              value={c.name}
              onChange={(e) => setCol(i, { name: e.target.value })}
            />
            <Input
              className="flex-1"
              placeholder="Extraction prompt"
              value={c.prompt}
              onChange={(e) => setCol(i, { prompt: e.target.value })}
            />
            <NativeSelect
              className="w-32"
              value={c.format ?? ""}
              onChange={(e) => setCol(i, { format: e.target.value || undefined })}
            >
              {COLUMN_FORMATS.map((f) => (
                <NativeSelectOption key={f.value} value={f.value}>
                  {f.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() =>
          setColumns((cols) => [...cols, { index: cols.length, name: "", prompt: "" }])
        }
      >
        + Add column
      </Button>
    </div>
  );
}
