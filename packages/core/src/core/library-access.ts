import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db/client";
import { clauses, matters, workflows } from "@workspace/db/schema";
import {
  canAccessArtifact,
  hasClientAccess,
  hasMatterAccess,
  type AccessReader,
} from "./access.js";
import type { Actor } from "./commit.js";

/** Read-only approved Library access in a verified matter; never authorizes publishing or global listing. */
export async function canReadApprovedLibrary(
  actor: Actor,
  kind: "clause" | "workflow",
  id: string,
  matterId: string,
  reader: AccessReader = db
) {
  if (!(await hasMatterAccess(actor, matterId, "viewer", reader))) return false;
  const [matter] = await reader.select().from(matters).where(eq(matters.id, matterId));
  if (!matter) return false;
  if (kind === "workflow") {
    const [item] = await reader
      .select()
      .from(workflows)
      .where(and(eq(workflows.id, id), eq(workflows.status, "approved")));
    if (!item) return false;
    if (item.isSystem && !item.tenantId && !item.matterId) return true;
    if (item.tenantId !== matter.tenantId) return false;
    return item.matterId ? canAccessArtifact(actor, kind, id, "viewer", reader) : true;
  }
  const [item] = await reader
    .select()
    .from(clauses)
    .where(and(eq(clauses.id, id), eq(clauses.status, "approved")));
  if (!item || item.tenantId !== matter.tenantId) return false;
  if (
    item.clientId &&
    (item.clientId !== matter.clientId ||
      !(await hasClientAccess(actor, item.clientId, "viewer", reader)))
  )
    return false;
  return item.matterId ? canAccessArtifact(actor, kind, id, "viewer", reader) : true;
}
