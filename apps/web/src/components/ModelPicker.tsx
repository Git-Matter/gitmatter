import { useEffect, useMemo, useState } from "react";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { AlertTriangle, Check, ChevronDown, Search } from "lucide-react";
import { api, type LlmProvider, type OpenRouterModel } from "../lib/api";
import { useModelCatalog } from "../lib/queries";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Provider families we name in the rail. Anything else from OpenRouter buckets
// into "other". `gemini` (native) and `google` (OpenRouter) share one family.
const FAMILY_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  "meta-llama": "Meta",
  mistralai: "Mistral",
  deepseek: "DeepSeek",
  "x-ai": "xAI",
  qwen: "Qwen",
  other: "Other",
};

// Rail is split in two: families we have a direct native catalog for, then the
// OpenRouter long tail under an "OpenRouter" heading.
const NATIVE_FAMILIES = ["anthropic", "openai", "google"];
const OR_FAMILIES = ["meta-llama", "mistralai", "deepseek", "x-ai", "qwen", "other"];

// One render shape for both sources. Native catalog models route on their bare
// id; OpenRouter models route on "vendor/model". `available` is false for native
// models whose provider has no key — the row greys out and can't be picked.
type Item = {
  id: string;
  name: string;
  family: string;
  tier?: PriceTier;
  available: boolean;
  // Why it's unavailable, shown on hover. Empty when available.
  reason?: string;
};

/**
 * Model selector. A quiet toolbar button opens a searchable popover: a provider
 * rail on the left filters a plain list of model names. Lists the curated
 * native-key models plus live OpenRouter results. Empty value means "server
 * default". Shared by chat (per message) and tabular reviews (per run).
 */
export function ModelPicker({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (model: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { data: catalog = [] } = useModelCatalog();
  const [query, setQuery] = useState("");
  const [orResults, setOrResults] = useState<OpenRouterModel[]>([]);
  const [orLoading, setOrLoading] = useState(false);
  const [family, setFamily] = useState<string | null>(null);

  // Flat list of native models for label lookup.
  const nativeModels = useMemo(() => catalog.flatMap((p) => p.models), [catalog]);

  // Populate OpenRouter results on open (head of catalog) and on each search.
  // Debounced 500ms so we query once the user pauses, not on every keystroke.
  const [debouncedQuery] = useDebouncedValue(query.trim(), { wait: 500 });
  useEffect(() => {
    if (!open) return;
    setOrLoading(true);
    api
      .searchOpenRouterModels(debouncedQuery)
      .then(setOrResults)
      .catch(() => setOrResults([]))
      .finally(() => setOrLoading(false));
  }, [debouncedQuery, open]);

  const label = useMemo(() => {
    if (!value) return "Select model";
    return nativeModels.find((m) => m.id === value)?.label ?? value;
  }, [value, nativeModels]);

  // Whether the user has an OpenRouter key — gates the OpenRouter results.
  const orAvailable = useMemo(
    () => catalog.find((p) => p.provider === "openrouter")?.available ?? false,
    [catalog]
  );

  // Native models first, then OpenRouter — both normalized to Item. Each carries
  // its provider's availability so unavailable ones render greyed out.
  const items = useMemo<Item[]>(() => {
    const native: Item[] = catalog.flatMap((p) =>
      p.models.map((m) => ({
        id: m.id,
        name: m.label,
        family: familyOf(m.provider),
        available: p.available,
        reason: p.available ? undefined : "Unavailable: API key not found",
      }))
    );
    // OpenRouter is the long tail only — we already serve Anthropic/OpenAI/Google
    // through direct keys, so drop their OpenRouter duplicates.
    const remote: Item[] = orResults
      .map((m) => ({
        id: m.id,
        name: m.name,
        family: bucketFamily(m.id),
        tier: priceTier(m.completionPrice),
        available: orAvailable,
        reason: orAvailable ? undefined : "Unavailable: OpenRouter API key not found",
      }))
      .filter((it) => !NATIVE_FAMILIES.includes(it.family));
    return [...native, ...remote];
  }, [catalog, orResults, orAvailable]);

  // Rail entries, split into native vs OpenRouter, each in preferred order.
  const { nativeFams, orFams } = useMemo(() => {
    const present = new Set(items.map((it) => it.family));
    return {
      nativeFams: NATIVE_FAMILIES.filter((f) => present.has(f)),
      orFams: OR_FAMILIES.filter((f) => present.has(f)),
    };
  }, [items]);

  const q = query.trim().toLowerCase();
  const shown = items
    .filter((it) => {
      if (family && it.family !== family) return false;
      if (!q) return true;
      return it.name.toLowerCase().includes(q) || it.id.toLowerCase().includes(q);
    })
    // Available models float to the top; order is otherwise preserved (stable sort).
    .sort((a, b) => Number(b.available) - Number(a.available));

  function pick(it: Item) {
    if (!it.available) return;
    onChange(it.id);
    setOpen(false);
    setQuery("");
    setFamily(null);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-md bg-transparent px-2 text-sm whitespace-nowrap text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
          className
        )}
      >
        <span className="max-w-[10rem] truncate">{label}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[26rem] gap-0 overflow-hidden p-0">
        {/* Search header */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search models…"
            className="h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex max-h-[22rem]">
          {/* Provider rail */}
          <div className="flex w-28 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border p-1.5">
            <RailItem active={family === null} label="All" onClick={() => setFamily(null)} />
            {nativeFams.map((f) => (
              <RailItem
                key={f}
                active={family === f}
                label={FAMILY_LABELS[f] ?? f}
                onClick={() => setFamily(f)}
              />
            ))}
            {orFams.length > 0 && (
              <div className="px-2 pt-2 pb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                OpenRouter
              </div>
            )}
            {orFams.map((f) => (
              <RailItem
                key={f}
                active={family === f}
                label={FAMILY_LABELS[f] ?? f}
                onClick={() => setFamily(f)}
              />
            ))}
          </div>

          {/* Model list */}
          <div className="flex-1 overflow-y-auto p-1">
            {shown.map((it) => (
              <Row
                key={it.id}
                active={value === it.id}
                title={it.name}
                tier={it.tier}
                available={it.available}
                reason={it.reason}
                onClick={() => pick(it)}
              />
            ))}

            {orLoading &&
              [0, 1, 2].map((i) => <Skeleton key={i} className="mx-2 my-1.5 h-4 w-40" />)}

            {!orLoading && shown.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                No models match “{query.trim()}”.
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function RailItem({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        active && "bg-muted font-medium text-foreground"
      )}
    >
      {label}
    </button>
  );
}

function Row({
  active,
  title,
  tier,
  available,
  reason,
  onClick,
}: {
  active: boolean;
  title: string;
  tier?: PriceTier;
  available: boolean;
  reason?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!available}
      title={available ? undefined : reason}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
        available ? "hover:bg-muted" : "cursor-not-allowed opacity-50"
      )}
    >
      <Check className={cn("size-4 shrink-0", active ? "opacity-100" : "opacity-0")} />
      <span
        className={cn("truncate text-sm", available ? "text-foreground" : "text-muted-foreground")}
      >
        {title}
      </span>
      {!available && (
        <AlertTriangle className="ms-auto size-3.5 shrink-0 text-amber-500" aria-label={reason} />
      )}
      {available && tier && (
        <span className={cn("ms-auto text-xs font-semibold", tier.color)}>{tier.label}</span>
      )}
    </button>
  );
}

// ---- helpers ----

type PriceTier = { label: string; color: string };

// Tier by completion price ($/1M output tokens) — cheap reads green, dear reads red.
function priceTier(perM: number): PriceTier {
  if (!perM) return { label: "Free", color: "text-emerald-600" };
  if (perM < 1) return { label: "$", color: "text-emerald-600" };
  if (perM < 5) return { label: "$$", color: "text-emerald-600" };
  if (perM < 15) return { label: "$$$", color: "text-amber-600" };
  return { label: "$$$+", color: "text-red-600" };
}

// Normalize a native provider to the same family key OpenRouter ids use.
function familyOf(provider: LlmProvider): string {
  return provider === "gemini" ? "google" : provider;
}

// OpenRouter id "vendor/model" → a named family, else "other".
function bucketFamily(id: string): string {
  const vendor = id.includes("/") ? id.split("/")[0]! : "other";
  return vendor in FAMILY_LABELS ? vendor : "other";
}
