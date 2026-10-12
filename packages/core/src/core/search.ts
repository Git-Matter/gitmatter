import { hasMatterAccess } from "./access.js";
import { user } from "@workspace/db/schema";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@workspace/db/client";
import { z } from "zod";
import type { Actor } from "./commit.js";

export const matterSearchSchema = z.object({
  query: z.string().trim().min(1).max(300),
  matterId: z.uuid().optional(),
  type: z.enum(["document", "cell", "clause", "playbook", "matter"]).optional(),
  page: z.number().int().nonnegative().max(10000).default(0),
  pageSize: z.number().int().min(1).max(50).default(20),
});
export type SearchResult = {
  id: string;
  type: "document" | "cell" | "clause" | "playbook" | "matter";
  title: string;
  snippet: string;
  matterId: string | null;
  matterName: string | null;
  url: string;
  rank: number;
};

/** SQL authorization precedes matching, ranking, counts and pagination. No global corpus statistics. */
export async function searchMatterWork(
  actor: Actor,
  input: z.input<typeof matterSearchSchema>
): Promise<{ results: SearchResult[]; rowCount: number }> {
  const params = matterSearchSchema.parse(input);
  if (params.matterId && !(await hasMatterAccess(actor, params.matterId)))
    return { results: [], rowCount: 0 };
  const scope = actor.type === "agent" ? actor.scope?.matterIds : undefined;
  const scoped = (matter: SQL): SQL =>
    scope
      ? scope.length
        ? sql`${matter} in (${sql.join(
            scope.map((id) => sql`${id}::uuid`),
            sql`, `
          )})`
        : sql`false`
      : sql`true`;
  const filtered = (matter: SQL): SQL =>
    params.matterId ? sql`${matter} = ${params.matterId}::uuid` : sql`true`;
  const tenant = sql`(select nullif(${user.tenantId}, '')::uuid from ${user} where ${user.id} = ${actor.userId})`;
  const member = (matter: SQL): SQL =>
    sql`exists (select 1 from matter_members mm join matters m on m.id = mm.matter_id where mm.user_id = ${actor.userId} and mm.matter_id = ${matter} and m.tenant_id = ${tenant})`;
  const artifact = (kind: string, alias: string): SQL => {
    const id = sql.raw(`${alias}.id`),
      matter = sql.raw(`${alias}.matter_id`),
      owner = sql.raw(`${alias}.user_id`),
      itemTenant = sql.raw(`${alias}.tenant_id`);
    return sql`${itemTenant} = ${tenant} and ${scoped(matter)} and (${owner} = ${actor.userId} or ${member(matter)} or exists(select 1 from artifact_shares s where s.artifact_type = ${kind} and s.artifact_id = ${id} and s.user_id = ${actor.userId}))`;
  };
  const library = (kind: "clause" | "workflow", alias: string): SQL => {
    const ordinary = artifact(kind, alias);
    const matter = sql.raw(`${alias}.matter_id`),
      status = sql.raw(`${alias}.status`),
      itemTenant = sql.raw(`${alias}.tenant_id`);
    const context = params.matterId
      ? sql`${member(sql`${params.matterId}::uuid`)} and ${scoped(sql`${params.matterId}::uuid`)}`
      : scope
        ? sql`false`
        : sql`true`;
    const overlay =
      kind === "clause"
        ? sql`(${sql.raw(`${alias}.client_id`)} is null or (exists (select 1 from client_members cm where cm.client_id = ${sql.raw(`${alias}.client_id`)} and cm.user_id = ${actor.userId}) ${params.matterId ? sql`and ${sql.raw(`${alias}.client_id`)} = (select client_id from matters where id = ${params.matterId}::uuid)` : sql``}))`
        : sql`true`;
    return sql`(${ordinary} or (${matter} is null and ${itemTenant} = ${tenant} and ${status} = 'approved' and ${context})) and ${overlay}`;
  };
  const query = sql`websearch_to_tsquery('english', ${params.query})`;
  const vector = (body: SQL) => sql`to_tsvector('english', ${body})`;
  const branches: SQL[] = [];
  if (!params.type || params.type === "document")
    branches.push(sql`
    select d.id::text id, 'document'::text kind, d.title, (coalesce(d.title, '') || ' ' || coalesce(d.markdown, '')) body,
      coalesce((select ar.matter_id from accessible_reviews ar where ar.document_ids @> jsonb_build_array(d.id::text) ${params.matterId ? sql`and ar.matter_id = ${params.matterId}::uuid` : sql``} order by ar.id limit 1), d.matter_id) matter_id, null::uuid parent_id
    from documents d where d.deleted_at is null and not d.staged and
      ((${artifact("document", "d")} and ${filtered(sql`d.matter_id`)}) or exists(select 1 from accessible_reviews ar where ar.document_ids @> jsonb_build_array(d.id::text) and ${filtered(sql`ar.matter_id`)}))
      and ${vector(sql`(coalesce(d.title, '') || ' ' || coalesce(d.markdown, ''))`)} @@ ${query}`);
  if (!params.type || params.type === "cell")
    branches.push(sql`
    select c.id::text id, 'cell'::text kind, r.title, (coalesce(c.content->>'summary', '') || ' ' || coalesce(c.content->>'reasoning', '')) body, r.matter_id, r.id parent_id
    from tabular_cells c join accessible_reviews r on r.id = c.review_id
    where c.status = 'done' and c.content is not null and ${filtered(sql`r.matter_id`)}
      and ${vector(sql`(coalesce(c.content->>'summary', '') || ' ' || coalesce(c.content->>'reasoning', ''))`)} @@ ${query}`);
  if (!params.type || params.type === "clause")
    branches.push(sql`
    select c.id::text id, 'clause'::text kind, c.title, (coalesce(c.title, '') || ' ' || coalesce(c.body, '')) body, c.matter_id, null::uuid parent_id
    from clauses c where (${library("clause", "c")}) and (c.matter_id is null or ${filtered(sql`c.matter_id`)}) and c.status <> 'deprecated'
      and ${vector(sql`(coalesce(c.title, '') || ' ' || coalesce(c.body, ''))`)} @@ ${query}`);
  if (!params.type || params.type === "playbook")
    branches.push(sql`
    select w.id::text id, 'playbook'::text kind, w.title, (coalesce(w.title, '') || ' ' || coalesce(w.rules::text, '')) body, w.matter_id, null::uuid parent_id
    from workflows w where w.type = 'playbook' and w.status <> 'deprecated' and (${library("workflow", "w")} or (w.is_system and w.status = 'approved' and w.tenant_id is null and ${scope ? (params.matterId ? sql`${member(sql`${params.matterId}::uuid`)} and ${scoped(sql`${params.matterId}::uuid`)}` : sql`false`) : sql`true`}))
      and (w.matter_id is null or ${filtered(sql`w.matter_id`)}) and ${vector(sql`(coalesce(w.title, '') || ' ' || coalesce(w.rules::text, ''))`)} @@ ${query}`);
  if (!params.type || params.type === "matter")
    branches.push(sql`
    select m.id::text id, 'matter'::text kind, m.name title, (coalesce(m.name, '') || ' ' || coalesce(m.practice_area, '') || ' ' || coalesce(m.jurisdiction, '')) body, m.id matter_id, null::uuid parent_id
    from matters m where m.tenant_id = ${tenant} and ${member(sql`m.id`)} and ${scoped(sql`m.id`)} and ${filtered(sql`m.id`)}
      and ${vector(sql`(coalesce(m.name, '') || ' ' || coalesce(m.practice_area, '') || ' ' || coalesce(m.jurisdiction, ''))`)} @@ ${query}`);
  type SearchRow = {
    count: number;
    id: string | null;
    kind: SearchResult["type"];
    title: string;
    snippet: string | null;
    matter_id: string | null;
    matter_name: string | null;
    parent_id: string | null;
    rank: number | null;
  };
  const rows = await db.execute<SearchRow>(sql`
    with accessible_reviews as materialized (select r.* from tabular_reviews r where ${artifact("tabular_review", "r")}),
    matches as materialized (${sql.join(branches, sql` union all `)}),
    ranked as (select *, ts_rank_cd(${vector(sql`body`)}, ${query}) rank from matches),
    total as (select count(*)::int count from matches),
    page as (select * from ranked order by rank desc, kind asc, id asc limit ${params.pageSize} offset ${params.page * params.pageSize})
    select total.count, p.id, p.kind, p.title, p.matter_id, p.parent_id, p.rank,
      ts_headline('english', p.body, ${query}, 'StartSel=, StopSel=, MaxWords=30, MinWords=10') snippet,
      (select m.name from matters m where m.id = p.matter_id and m.tenant_id = ${tenant} and ${member(sql`m.id`)} and ${scoped(sql`m.id`)}) matter_name
    from total left join page p on true order by p.rank desc nulls last, p.kind, p.id`);
  const results = rows
    .filter((row) => row.id)
    .map((row) => {
      const type = row.kind as SearchResult["type"],
        id = row.id!;
      const url =
        type === "document"
          ? `/documents/${id}`
          : type === "cell"
            ? `/reviews/${row.parent_id ?? ""}?finding=${id}`
            : type === "matter"
              ? `/matters/${id}`
              : type === "clause"
                ? `/library?clause=${id}`
                : `/workflows/tabular-review/${id}`;
      return {
        id,
        type,
        title: row.title,
        snippet: row.snippet ?? "",
        matterId: row.matter_id,
        matterName: row.matter_name,
        url,
        rank: Number(row.rank),
      };
    });
  return { results, rowCount: Number(rows[0]?.count ?? 0) };
}
