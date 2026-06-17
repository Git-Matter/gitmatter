import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar";

const MAX_AVATARS = 3;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

/**
 * Avatar stack for "people with access". `count` is the total (owner + shares);
 * `names` are the first few names for the avatars. ≤ 1 person reads as "Private".
 * Clicking opens the manage-people dialog when `onClick` is given.
 */
export function SharedWithCell({
  count,
  names,
  onClick,
}: {
  count: number;
  names: string[];
  onClick?: () => void;
}) {
  if (count <= 1) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className="text-sm text-muted-foreground enabled:hover:text-foreground enabled:hover:underline"
      >
        Private
      </button>
    );
  }
  const shown = names.slice(0, MAX_AVATARS);
  const overflow = count - shown.length;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="flex items-center enabled:cursor-pointer"
      title={`${count} people with access`}
      aria-label={`${count} people with access`}
    >
      <AvatarGroup>
        {shown.map((n, i) => (
          <Avatar key={i} size="sm">
            <AvatarFallback>{initials(n)}</AvatarFallback>
          </Avatar>
        ))}
        {overflow > 0 && <AvatarGroupCount>+{overflow}</AvatarGroupCount>}
      </AvatarGroup>
    </button>
  );
}
