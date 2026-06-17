import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Icon-only row action menu. Renders only the handlers it's given.
export function RowActions({
  onDelete,
  onHide,
  onUnhide,
}: {
  onDelete?: () => void;
  onHide?: () => void;
  onUnhide?: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            title="Actions"
            aria-label="Row actions"
            className="text-muted-foreground"
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onHide && <DropdownMenuItem onClick={onHide}>Hide</DropdownMenuItem>}
        {onUnhide && <DropdownMenuItem onClick={onUnhide}>Unhide</DropdownMenuItem>}
        {onDelete && (
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
