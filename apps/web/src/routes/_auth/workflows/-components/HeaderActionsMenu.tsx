import type { LucideIcon } from "lucide-react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type HeaderActionItem = {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  variant?: "default" | "danger";
  disabled?: boolean;
};

// Icon-only "⋯" menu for page headers (rename / details / delete …).
export function HeaderActionsMenu({
  title = "Actions",
  items,
}: {
  title?: string;
  items: HeaderActionItem[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" title={title} aria-label={title} />}
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.label}
            variant={item.variant === "danger" ? "destructive" : "default"}
            disabled={item.disabled}
            onClick={item.onSelect}
          >
            <item.icon />
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
