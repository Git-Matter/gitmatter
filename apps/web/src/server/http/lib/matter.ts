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

/**
 * Resolve the matter for an uploaded file. An explicit matterId still requires
 * editor access; when none is given the document is created UNFILED (no matter)
 * rather than dumped into the default "General" matter. `{ ok: false }` means an
 * explicit matter was forbidden, so the route can answer 403 — distinct from the
 * legitimate unfiled case where `matterId` is null.
 */
export async function resolveUploadMatter(
  user: AuthedUser,
  matterId?: string
): Promise<{ ok: true; matterId: string | null } | { ok: false }> {
  if (matterId) {
    return (await hasMatterAccess(user.id, matterId, "editor"))
      ? { ok: true, matterId }
      : { ok: false };
  }
  return { ok: true, matterId: null };
}
