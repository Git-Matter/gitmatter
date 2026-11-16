import { sql } from "drizzle-orm";
import type { DB, Tx } from "@workspace/db/client";
import { templates, templateRevisions } from "@workspace/db/schema";

/** Metadata revisions can share bytes; bill each referenced object only once. */
export async function templateStorageBytes(reader: DB | Tx, tenantId: string) {
  const rows = await reader.execute(sql`
    select coalesce(sum(size_bytes), 0) as total from (
      select ${templateRevisions.storagePath}, max(${templateRevisions.sizeBytes}) as size_bytes
      from ${templateRevisions} inner join ${templates} on ${templates.id} = ${templateRevisions.templateId}
      where ${templates.tenantId} = ${tenantId} and ${templateRevisions.storagePath} is not null
      group by ${templateRevisions.storagePath}
    ) template_objects
  `);
  return Number(rows[0]?.total ?? 0);
}
