import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Briefcase,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Paperclip,
  Plus,
  Search,
  Table2,
  Users,
  X,
} from "lucide-react";
import { api, type ChatAttachment, type DocStatus } from "@/lib/data/api";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/util/utils";

type Kind = ChatAttachment["kind"];
type Option = { id: string; label: string; sub?: string; fileType?: string; status?: DocStatus };

// Carry file type + status into document attachments (for the upload card's
// icon/sublabel/spinner); other kinds are plain references.
function optionToAttachment(kind: Kind, opt: Option): ChatAttachment {
  return kind === "document"
    ? { kind, id: opt.id, label: opt.label, fileType: opt.fileType, status: opt.status }
    : { kind, id: opt.id, label: opt.label };
}

// Icon + loader per attachable entity. Loaders map each list endpoint to a
// uniform {id,label,sub} so the picker stays generic.
const SOURCES: Array<{
  kind: Kind;
  label: string;
  icon: typeof FileText;
  load: (matterId?: string) => Promise<Option[]>;
}> = [
  {
    kind: "document",
    label: "Documents",
    icon: FileText,
    // In a matter workspace, scope to that matter's documents; otherwise list all.
    load: (matterId?: string) =>
      (matterId ? api.listMatterDocuments(matterId) : api.listDocuments()).then((ds) =>
        ds.map((d) => ({
          id: d.id,
          label: d.title,
          sub: d.status,
          fileType: d.fileType,
          status: d.status,
        }))
      ),
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

// Backend accepts these only (see documents upload route); images are rejected.
const UPLOAD_ACCEPT = ".pdf,.docx,.doc";

/**
 * Local-file picker for the composer. Hands the chosen file to `onUpload`, which
 * adds the chip and drives it through storage + extraction (see useChatSession);
 * the per-file spinner now lives on the chip, not this button.
 */
function useDocumentUpload(onUpload: (file: File) => void) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (file) onUpload(file);
  }

  return {
    pick: () => fileInputRef.current?.click(),
    input: (
      <input
        ref={fileInputRef}
        type="file"
        accept={UPLOAD_ACCEPT}
        className="hidden"
        onChange={onChange}
      />
    ),
  };
}

/**
 * Attach controls for the composer. When there's room, file upload and every
 * source get their own quiet icon button (with a tooltip); on narrow widths they
 * collapse behind a single labeled "+" menu.
 */
export function AttachControls({
  attachments,
  onAdd,
  onUpload,
  matterId,
}: {
  attachments: ChatAttachment[];
  onAdd: (a: ChatAttachment) => void;
  onUpload: (file: File) => void;
  matterId?: string;
}) {
  const upload = useDocumentUpload(onUpload);
  return (
    <>
      {/* Wide: upload + each source inline. */}
      <div className="hidden items-center gap-0.5 @sm/composer:flex">
        {upload.input}
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label="Upload a file"
                onClick={upload.pick}
                className="flex h-8 shrink-0 items-center rounded-md px-2 text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Paperclip className="size-4 shrink-0" />
              </button>
            }
          />
          <TooltipContent>Upload a file</TooltipContent>
        </Tooltip>
        {SOURCES.map((s) => (
          <AttachSourceButton
            key={s.kind}
            source={s}
            matterId={matterId}
            selectedIds={new Set(attachments.filter((a) => a.kind === s.kind).map((a) => a.id))}
            onPick={(opt) => onAdd(optionToAttachment(s.kind, opt))}
          />
        ))}
      </div>
      {/* Narrow: collapsed behind a labeled "+". */}
      <div className="@sm/composer:hidden">
        <AttachMenu
          attachments={attachments}
          onAdd={onAdd}
          onUpload={onUpload}
          matterId={matterId}
        />
      </div>
    </>
  );
}

/** One source as a standalone icon button (with tooltip) + its searchable popover. */
function AttachSourceButton({
  source,
  selectedIds,
  onPick,
  matterId,
}: {
  source: (typeof SOURCES)[number];
  selectedIds: Set<string>;
  onPick: (opt: Option) => void;
  matterId?: string;
}) {
  const [open, setOpen] = useState(false);
  const Icon = source.icon;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              aria-label={source.label}
              className="relative flex h-8 shrink-0 items-center rounded-md px-2 text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Icon className="size-4 shrink-0" />
              {selectedIds.size > 0 && (
                <span className="absolute top-1 right-0.5 size-1.5 rounded-full bg-primary" />
              )}
            </PopoverTrigger>
          }
        />
        <TooltipContent>{source.label}</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-72 gap-0 overflow-hidden p-0">
        <SourceList
          source={source}
          matterId={matterId}
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
 * Single "+" button that holds file upload and every attach source. Opens to a
 * short labeled menu (Upload a file / Documents / Matters / …); picking a source
 * drills into its searchable list.
 */
export function AttachMenu({
  attachments,
  onAdd,
  onUpload,
  matterId,
}: {
  attachments: ChatAttachment[];
  onAdd: (a: ChatAttachment) => void;
  onUpload: (file: File) => void;
  matterId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<Kind | null>(null);
  const source = active ? SOURCES.find((s) => s.kind === active) : undefined;
  const upload = useDocumentUpload((file) => {
    onUpload(file);
    onOpenChange(false);
  });

  // Drop back to the source menu whenever the popover closes.
  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setActive(null);
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              aria-label="Attach files and context"
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm whitespace-nowrap text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Plus className="size-4 shrink-0" />
            </PopoverTrigger>
          }
        />
        <TooltipContent>Attach files and context</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-72 gap-0 overflow-hidden p-0">
        {source ? (
          <SourceList
            source={source}
            matterId={matterId}
            selectedIds={
              new Set(attachments.filter((a) => a.kind === source.kind).map((a) => a.id))
            }
            onBack={() => setActive(null)}
            onPick={(opt) => {
              onAdd(optionToAttachment(source.kind, opt));
              onOpenChange(false);
            }}
          />
        ) : (
          <div className="p-1">
            {upload.input}
            <button
              type="button"
              onClick={upload.pick}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
            >
              <Paperclip className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex-1">Upload a file</span>
            </button>
            <div className="my-1 h-px bg-border" />
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

// Tint the document card's icon tile by file type (matches the file's brand cue).
function fileTypeTile(fileType?: string): string {
  if (fileType === "pdf") return "bg-red-500";
  if (fileType === "docx" || fileType === "doc") return "bg-blue-500";
  return "bg-muted-foreground";
}

/** A removable card for an uploaded/attached document, with a live extraction spinner. */
function DocumentChip({ a, onRemove }: { a: ChatAttachment; onRemove: () => void }) {
  const processing = a.status === "pending" || a.status === "processing";
  const failed = a.status === "failed";
  // Thin extraction (likely a scan): show a passive warning instead of the type.
  const lowText = a.status === "ready" && a.ocrSuggested;
  const sublabel =
    a.status === "pending"
      ? "Uploading…"
      : a.status === "processing"
        ? "Extracting…"
        : failed
          ? "Failed"
          : (a.fileType?.toUpperCase() ?? "Document");
  return (
    <div className="inline-flex max-w-full items-center gap-2.5 rounded-xl border border-border bg-card py-2 ps-2 pe-2.5">
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg text-white",
          fileTypeTile(a.fileType)
        )}
      >
        {processing ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
      </div>
      <div className="min-w-0">
        <div className="max-w-[180px] truncate text-sm leading-tight font-medium">{a.label}</div>
        {lowText ? (
          <Tooltip>
            <TooltipTrigger
              render={<div className="cursor-default text-xs text-bronze">Little text found</div>}
            />
            <TooltipContent>
              This PDF may be scanned — little text could be extracted
            </TooltipContent>
          </Tooltip>
        ) : failed && a.extractionError ? (
          <Tooltip>
            <TooltipTrigger
              render={<div className="cursor-default text-xs text-destructive">{sublabel}</div>}
            />
            <TooltipContent>{a.extractionError}</TooltipContent>
          </Tooltip>
        ) : (
          <div className={cn("text-xs", failed ? "text-destructive" : "text-muted-foreground")}>
            {sublabel}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="-me-0.5 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={`Remove ${a.label}`}
      >
        <X className="size-4" />
      </button>
    </div>
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
        // Documents render as a rich card (file icon + extraction state); other
        // kinds stay compact reference pills.
        if (a.kind === "document") {
          return <DocumentChip key={`${a.kind}:${a.id}`} a={a} onRemove={() => onRemove(a)} />;
        }
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
  matterId,
}: {
  source: (typeof SOURCES)[number];
  selectedIds: Set<string>;
  // Present only when nested under the collapsed "+" menu; absent for the
  // standalone per-source popovers, which have nothing to go back to.
  onBack?: () => void;
  onPick: (opt: Option) => void;
  matterId?: string;
}) {
  const [query, setQuery] = useState("");

  // Lazy-load this source's list once it's opened; cached per source kind (and
  // matter, so the matter-scoped list isn't served the global cache or vice-versa).
  const { data: options } = useQuery({
    queryKey: ["attach-source", source.kind, matterId ?? null],
    queryFn: () => source.load(matterId),
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
