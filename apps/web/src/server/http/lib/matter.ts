import { ensureDefaultMatter, hasMatterAccess } from "@workspace/core";
import type { AuthedUser } from "../middleware/auth.js";

/**
 * Resolve which matter a new artifact lands in: an explicit matterId (caller
 * must have editor access) or the user's default matter. Returns null when an
 * explicit matter is forbidden, so the route can answer 403.
 */
export async function resolveCreateMatter(
  user: AuthedUser,
  matterId?: string
): Promise<string | null> {
  if (matterId) {
    return (await hasMatterAccess(user.id, matterId, "editor")) ? matterId : null;
  }
  return ensureDefaultMatter(user.id, user.name, user.tenantId);
}
