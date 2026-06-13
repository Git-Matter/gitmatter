import { useMemo, useState } from "react";
import { Brain, Check } from "lucide-react";
import { type ReasoningEffort } from "../lib/api";
import { useModelCatalog } from "../lib/queries";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// null = Instant (no extended thinking).
const LEVELS: { value: ReasoningEffort | null; label: string }[] = [
  { value: null, label: "Instant" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

/**
 * Thinking-effort selector for the composer. Levels above Instant are greyed out
 * when the selected model can't reason. Mirrors the model picker's quiet styling.
 */
export function ReasoningPicker({
  model,
  value,
  onChange,
}: {
  model: string;
  value: ReasoningEffort | null;
  onChange: (v: ReasoningEffort | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: catalog = [] } = useModelCatalog();

  // Whether the chosen model supports thinking. Unknown (server default or an
  // OpenRouter id we don't have capabilities for) is treated as capable.
  const supported = useMemo(() => {
    if (!model || model.includes("/")) return true;
    const m = catalog.flatMap((p) => p.models).find((x) => x.id === model);
    return m?.capabilities?.reasoning ?? true;
  }, [model, catalog]);

  // When the model can't think, only Instant is selectable. The stored level is
  // left alone — the server ignores it for non-reasoning models (guard in chat.ts).
  const current = LEVELS.find((l) => l.value === value) ?? LEVELS[0]!;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        title="Thinking effort"
        className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-sm whitespace-nowrap text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Brain className="size-3.5 shrink-0" />
        <span className="hidden md:inline">{current.label}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-44 p-1">
        {LEVELS.map((l) => {
          const disabled = l.value !== null && !supported;
          return (
            <button
              key={l.label}
              type="button"
              disabled={disabled}
              onClick={() => {
                onChange(l.value);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                disabled
                  ? "cursor-not-allowed text-muted-foreground/40"
                  : "text-foreground hover:bg-muted"
              )}
            >
              <Check
                className={cn("size-4 shrink-0", l.value === value ? "opacity-100" : "opacity-0")}
              />
              {l.label}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
