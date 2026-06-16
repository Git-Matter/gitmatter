import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Single-select combobox over the user's practice areas, with inline add: typing
// a name not in the list offers "Add «name»", which persists it (reusable across
// workflows + matters) and selects it. Re-selecting the current value clears it.
export function PracticeAreaPicker({
  value,
  onChange,
  placeholder = "Select practice area…",
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: areas = [] } = useQuery({
    queryKey: queryKeys.practiceAreas,
    queryFn: () => api.listPracticeAreas(),
  });

  const addMutation = useMutation({
    mutationFn: (name: string) => api.createPracticeArea(name),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: queryKeys.practiceAreas });
      onChange(res.name);
      setOpen(false);
      setSearch("");
    },
  });

  const trimmed = search.trim();
  const filtered = trimmed
    ? areas.filter((a) => a.toLowerCase().includes(trimmed.toLowerCase()))
    : areas;
  const exists = areas.some((a) => a.toLowerCase() === trimmed.toLowerCase());

  function select(next: string | null) {
    onChange(next);
    setOpen(false);
    setSearch("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="outline" className="w-full justify-between font-normal" />}
      >
        {value ?? <span className="text-muted-foreground">{placeholder}</span>}
        <ChevronsUpDown className="ms-2 size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        {/* cmdk's built-in filter would hide the synthetic "Add" row — filter ourselves. */}
        <Command shouldFilter={false}>
          <CommandInput value={search} onValueChange={setSearch} placeholder="Search or add…" />
          <CommandList>
            {!filtered.length && !trimmed && <CommandEmpty>No practice areas.</CommandEmpty>}
            <CommandGroup>
              {value && (
                <CommandItem value="__clear__" onSelect={() => select(null)}>
                  <span className="text-muted-foreground">Clear selection</span>
                </CommandItem>
              )}
              {filtered.map((a) => (
                <CommandItem key={a} value={a} onSelect={() => select(a)}>
                  <Check className={cn("size-4", value === a ? "opacity-100" : "opacity-0")} />
                  {a}
                </CommandItem>
              ))}
              {trimmed && !exists && (
                <CommandItem
                  value={`__add__${trimmed}`}
                  onSelect={() => addMutation.mutate(trimmed)}
                  disabled={addMutation.isPending}
                >
                  <Plus className="size-4" />
                  Add “{trimmed}”
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
