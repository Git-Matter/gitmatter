import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, FileText, Folder } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { api, type Doc } from "@/lib/api";
import { formatShortDate } from "@/lib/format";

type MatterChoice = {
  matter: {
    id: string;
    name: string;
  };
};

export function ReviewDocumentPicker({
  docs,
  matters,
  selected,
  allChecked,
  onSelectAll,
  onToggle,
}: {
  docs: Doc[];
  matters: MatterChoice[];
  selected: Set<string>;
  allChecked: boolean;
  onSelectAll: () => void;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-field">
      <Label>Select documents</Label>
      <div className="flex flex-col overflow-hidden rounded-lg border border-border">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2 text-sm text-muted-foreground">
          <span>Documents</span>
          {docs.length > 0 && (
            <button
              type="button"
              onClick={onSelectAll}
              className="text-muted-foreground hover:text-foreground"
            >
              {allChecked ? "Clear all" : "Select all"}
            </button>
          )}
        </div>
        <div className="max-h-56 overflow-y-auto">
          {docs.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">No documents yet.</p>
          ) : (
            docs.map((d, i) => (
              <DocRow
                key={d.id}
                doc={d}
                checked={selected.has(d.id)}
                onToggle={() => onToggle(d.id)}
                topBorder={i > 0}
              />
            ))
          )}

          {matters.length > 0 && (
            <>
              <div className="border-t border-border px-3 py-2 text-sm text-muted-foreground">
                Matters
              </div>
              {matters.map((m) => (
                <MatterFolder
                  key={m.matter.id}
                  matterId={m.matter.id}
                  name={m.matter.name}
                  selected={selected}
                  onToggle={onToggle}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DocRow({
  doc,
  checked,
  onToggle,
  indent = false,
  topBorder = true,
}: {
  doc: Doc;
  checked: boolean;
  onToggle: () => void;
  indent?: boolean;
  topBorder?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/50 ${topBorder ? "border-t border-border" : ""} ${indent ? "pl-9" : ""}`}
    >
      <Checkbox checked={checked} onChange={onToggle} aria-label={`Select ${doc.title}`} />
      <FileText className="size-4 shrink-0 text-bronze" />
      <span className="min-w-0 flex-1 truncate">{doc.title}</span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {formatShortDate(doc.createdAt)}
      </span>
    </label>
  );
}

function MatterFolder({
  matterId,
  name,
  selected,
  onToggle,
}: {
  matterId: string;
  name: string;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["matter-documents", matterId],
    queryFn: () => api.listMatterDocuments(matterId),
    enabled: open,
  });

  return (
    <div className="border-t border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-sm hover:bg-muted/50"
      >
        <ChevronRight
          className={`size-3.5 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
        />
        <Folder className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-start">{name}</span>
      </button>
      {open &&
        (isLoading ? (
          <p className="px-9 py-2 text-xs text-muted-foreground">Loading...</p>
        ) : docs.length === 0 ? (
          <p className="px-9 py-2 text-xs text-muted-foreground">No documents.</p>
        ) : (
          docs.map((d) => (
            <DocRow
              key={d.id}
              doc={d}
              checked={selected.has(d.id)}
              onToggle={() => onToggle(d.id)}
              indent
            />
          ))
        ))}
    </div>
  );
}
