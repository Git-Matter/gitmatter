import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Briefcase,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Plus,
  Search,
  Table2,
  Users,
  X,
} from "lucide-react";
import { api, type ChatAttachment } from "../lib/api";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Kind = ChatAttachment["kind"];
type Option = { id: string; label: string; sub?: string };

// Icon + loader per attachable entity. Loaders map each list endpoint to a
// uniform {id,label,sub} so the picker stays generic.
const SOURCES: Array<{
  kind: Kind;
  label: string;
  icon: typeof FileText;
  load: () => Promise<Option[]>;
}> = [
  {
    kind: "document",
    label: "Documents",
    icon: FileText,
    load: () =>
      api
        .listDocuments()
        .then((ds) => ds.map((d) => ({ id: d.id, label: d.title, sub: d.status }))),
  },
  {
    kind: "matter",
    label: "Matters",
    icon: Briefcase,
    load: () =>
      api
        .listMatters()
        .then((ms) =>
          ms.map((m) => ({ id: m.matter.id, label: m.matter.name, sub: m.client.name }))
        ),
  },
  {
    kind: "client",
    label: "Clients",
    icon: Users,
    load: () =>
      api
        .listClients()
        .then((cs) =>
          cs.map((c) => ({ id: c.id, label: c.name, sub: c.clientNumber ?? undefined }))
        ),
  },
  {
    kind: "review",
    label: "Reviews",
    icon: Table2,
    load: () => api.listReviews().then((rs) => rs.map((r) => ({ id: r.id, label: r.title }))),
  },
];

const KIND_ICON: Record<Kind, typeof FileText> = {
  document: FileText,
  matter: Briefcase,
  client: Users,
  review: Table2,
};

/**
 * Attach controls for the composer. When there's room, every source gets its own
 * quiet icon button; on narrow widths they collapse behind a single "+" menu.
 */
export function AttachControls({
  attachments,
  onAdd,
}: {
  attachments: ChatAttachment[];
  onAdd: (a: ChatAttachment) => void;
}) {
  return (
    <>
      {/* Wide: each source inline. */}
      <div className="hidden items-center gap-0.5 md:flex">
        {SOURCES.map((s) => (
          <AttachSourceButton
            key={s.kind}
            source={s}
            selectedIds={new Set(attachments.filter((a) => a.kind === s.kind).map((a) => a.id))}
            onPick={(opt) => onAdd({ kind: s.kind, id: opt.id, label: opt.label })}
          />
        ))}
      </div>
      {/* Narrow: collapsed behind "+". */}
      <div className="md:hidden">
        <AttachMenu attachments={attachments} onAdd={onAdd} />
      </div>
    </>
  );
}

/** One source as a standalone icon button + its searchable popover. */
function AttachSourceButton({
  source,
  selectedIds,
  onPick,
}: {
  source: (typeof SOURCES)[number];
  selectedIds: Set<string>;
  onPick: (opt: Option) => void;
}) {
  const [open, setOpen] = useState(false);
  const Icon = source.icon;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        title={source.label}
        aria-label={source.label}
        className="relative flex h-8 shrink-0 items-center rounded-md px-2 text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Icon className="size-4 shrink-0" />
        {selectedIds.size > 0 && (
          <span className="absolute top-1 right-0.5 size-1.5 rounded-full bg-primary" />
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-0 overflow-hidden p-0">
        <SourceList
          source={source}
          selectedIds={selectedIds}
          onPick={(opt) => {
            onPick(opt);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * Single "+" button that holds every attach source. Opens to a short source menu
 * (Documents / Matters / …); picking one drills into that source's searchable
 * list. Used on narrow widths where the per-source buttons don't fit.
 */
export function AttachMenu({
  attachments,
  onAdd,
}: {
  attachments: ChatAttachment[];
  onAdd: (a: ChatAttachment) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<Kind | null>(null);
  const source = active ? SOURCES.find((s) => s.kind === active) : undefined;

  // Drop back to the source menu whenever the popover closes.
  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setActive(null);
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        title="Attach context"
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm whitespace-nowrap text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Plus className="size-4 shrink-0" />
        <span className="hidden md:inline">Attach</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-0 overflow-hidden p-0">
        {source ? (
          <SourceList
            source={source}
            selectedIds={
              new Set(attachments.filter((a) => a.kind === source.kind).map((a) => a.id))
            }
            onBack={() => setActive(null)}
            onPick={(opt) => {
              onAdd({ kind: source.kind, id: opt.id, label: opt.label });
              onOpenChange(false);
            }}
          />
        ) : (
          <div className="p-1">
            {SOURCES.map((s) => {
              const Icon = s.icon;
              const count = attachments.filter((a) => a.kind === s.kind).length;
              return (
                <button
                  key={s.kind}
                  type="button"
                  onClick={() => setActive(s.kind)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1">{s.label}</span>
                  {count > 0 && <span className="text-xs text-muted-foreground">{count}</span>}
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Chips above the input, one per attached item, each removable. */
export function AttachChips({
  attachments,
  onRemove,
}: {
  attachments: ChatAttachment[];
  onRemove: (a: ChatAttachment) => void;
}) {
  if (!attachments.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 px-4 pt-3">
      {attachments.map((a) => {
        const Icon = KIND_ICON[a.kind];
        return (
          <span
            key={`${a.kind}:${a.id}`}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 py-0.5 ps-2 pe-1 text-xs"
          >
            <Icon className="size-3 shrink-0 text-muted-foreground" />
            <span className="max-w-[160px] truncate">{a.label}</span>
            <button
              type="button"
              onClick={() => onRemove(a)}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={`Remove ${a.label}`}
            >
              <X className="size-3" />
            </button>
          </span>
        );
      })}
    </div>
  );
}

function SourceList({
  source,
  selectedIds,
  onBack,
  onPick,
}: {
  source: (typeof SOURCES)[number];
  selectedIds: Set<string>;
  // Present only when nested under the collapsed "+" menu; absent for the
  // standalone per-source popovers, which have nothing to go back to.
  onBack?: () => void;
  onPick: (opt: Option) => void;
}) {
  const [query, setQuery] = useState("");

  // Lazy-load this source's list once it's opened; cached per source kind.
  const { data: options } = useQuery({
    queryKey: ["attach-source", source.kind],
    queryFn: () => source.load(),
  });

  const q = query.trim().toLowerCase();
  const shown = (options ?? []).filter(
    (o) => !q || o.label.toLowerCase().includes(q) || o.sub?.toLowerCase().includes(q)
  );

  return (
    <>
      <div className="flex items-center gap-1.5 border-b border-border px-2 py-2.5">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
          </button>
        )}
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${source.label.toLowerCase()}…`}
          className="h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="max-h-72 overflow-y-auto p-1">
        {!options && [0, 1, 2].map((i) => <Skeleton key={i} className="mx-2 my-1.5 h-4 w-40" />)}

        {options &&
          shown.map((o) => {
            const picked = selectedIds.has(o.id);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => onPick(o)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted"
              >
                <Check className={cn("size-4 shrink-0", picked ? "opacity-100" : "opacity-0")} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{o.label}</span>
                  {o.sub && (
                    <span className="block truncate text-xs text-muted-foreground">{o.sub}</span>
                  )}
                </span>
              </button>
            );
          })}

        {options !== null && shown.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            No {source.label.toLowerCase()} found.
          </div>
        )}
      </div>
    </>
  );
}
