import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@workspace/db/client";
import {
  type ArtifactType,
  clients,
  commits,
  documents,
  fieldChanges,
  matterDocuments,
  matters,
  tabularReviews,
  user,
  workflows,
} from "@workspace/db/schema";
import { type CsvValue, rowsToCsv } from "../core/csv.js";
import { type DocxBlock, generateDocx } from "./docx/generate.js";

// One exported line of the audit trail: a field change, joined to its commit
// and the artifact it belongs to. Commits with no field changes (e.g. version
// bumps) still emit one line with an empty path so nothing disappears.
export type AuditTrailEntry = {
  at: Date;
  artifactType: ArtifactType;
  artifactId: string;
  artifactTitle: string;
  seq: number;
  actorType: string;
  actor: string; // "Name <email>" for users, agentLabel for agents
  op: string;
  message: string;
  path: string | null;
  before: unknown;
  after: unknown;
};

export type MatterAuditTrail = {
  matterId: string;
  matterName: string;
  clientName: string;
  artifactCount: number;
  entries: AuditTrailEntry[];
};

/** Every artifact on the matter: filed documents (via matter_documents, plus
 *  origin docs not yet linked), reviews, and workflows. */
async function matterArtifacts(matterId: string) {
  const [docs, linkedDocs, reviews, wfs] = await Promise.all([
    db
      .select({ id: documents.id, title: documents.title })
      .from(documents)
      .where(and(eq(documents.matterId, matterId), isNull(documents.deletedAt))),
    db
      .select({ id: documents.id, title: documents.title })
      .from(matterDocuments)
      .innerJoin(documents, eq(matterDocuments.documentId, documents.id))
      .where(and(eq(matterDocuments.matterId, matterId), isNull(documents.deletedAt))),
    db
      .select({ id: tabularReviews.id, title: tabularReviews.title })
      .from(tabularReviews)
      .where(eq(tabularReviews.matterId, matterId)),
    db
      .select({ id: workflows.id, title: workflows.title })
      .from(workflows)
      .where(eq(workflows.matterId, matterId)),
  ]);
  const byType = new Map<ArtifactType, Map<string, string>>([
    ["document", new Map([...docs, ...linkedDocs].map((d) => [d.id, d.title]))],
    ["tabular_review", new Map(reviews.map((r) => [r.id, r.title]))],
    ["workflow", new Map(wfs.map((w) => [w.id, w.title]))],
  ]);
  return byType;
}

/** Gather the full commit trail of a matter, one entry per field change,
 *  chronological. Read-only — never writes to the spine. */
export async function gatherMatterAudit(matterId: string): Promise<MatterAuditTrail | null> {
  const [m] = await db
    .select({ id: matters.id, name: matters.name, clientName: clients.name })
    .from(matters)
    .innerJoin(clients, eq(matters.clientId, clients.id))
    .where(eq(matters.id, matterId));
  if (!m) return null;

  const artifacts = await matterArtifacts(matterId);
  const conds = [...artifacts.entries()]
    .filter(([, ids]) => ids.size > 0)
    .map(([type, ids]) =>
      and(eq(commits.artifactType, type), inArray(commits.artifactId, [...ids.keys()]))
    );

  let entries: AuditTrailEntry[] = [];
  if (conds.length) {
    const rows = await db
      .select({
        commitId: commits.id,
        at: commits.createdAt,
        artifactType: commits.artifactType,
        artifactId: commits.artifactId,
        seq: commits.seq,
        actorType: commits.actorType,
        agentLabel: commits.agentLabel,
        op: commits.op,
        message: commits.message,
        actorName: user.name,
        actorEmail: user.email,
        path: fieldChanges.path,
        before: fieldChanges.before,
        after: fieldChanges.after,
      })
      .from(commits)
      .leftJoin(user, eq(user.id, commits.actorId))
      .leftJoin(fieldChanges, eq(fieldChanges.commitId, commits.id))
      .where(or(...conds))
      .orderBy(asc(commits.createdAt), asc(commits.seq));

    entries = rows.map((r) => ({
      at: r.at,
      artifactType: r.artifactType,
      artifactId: r.artifactId,
      artifactTitle: artifacts.get(r.artifactType)?.get(r.artifactId) ?? "(unknown)",
      seq: r.seq,
      actorType: r.actorType,
      actor:
        r.actorType === "agent"
          ? (r.agentLabel ?? "agent")
          : `${r.actorName ?? "unknown"} <${r.actorEmail ?? ""}>`,
      op: r.op,
      message: r.message,
      path: r.path,
      before: r.before,
      after: r.after,
    }));
  }

  const artifactCount = [...artifacts.values()].reduce((n, ids) => n + ids.size, 0);
  return { matterId, matterName: m.name, clientName: m.clientName, artifactCount, entries };
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

// Long field values (a whole document markdown) would make the export
// unreadable; keep enough to identify the change.
const VALUE_LIMIT = 500;
function clip(value: unknown): string {
  const text = cellText(value);
  return text.length > VALUE_LIMIT ? `${text.slice(0, VALUE_LIMIT)}…` : text;
}

const HEADER = [
  "timestamp",
  "artifact_type",
  "artifact_title",
  "artifact_id",
  "seq",
  "actor_type",
  "actor",
  "op",
  "message",
  "field_path",
  "before",
  "after",
];

export function auditTrailToCsv(trail: MatterAuditTrail): string {
  const rows: CsvValue[][] = [HEADER];
  for (const e of trail.entries) {
    rows.push([
      e.at,
      e.artifactType,
      e.artifactTitle,
      e.artifactId,
      e.seq,
      e.actorType,
      e.actor,
      e.op,
      e.message,
      e.path,
      clip(e.before),
      clip(e.after),
    ]);
  }
  return rowsToCsv(rows);
}

export async function auditTrailToDocx(trail: MatterAuditTrail): Promise<Uint8Array> {
  const blocks: DocxBlock[] = [
    { type: "heading", level: 1, text: `Audit trail — ${trail.matterName}` },
    {
      type: "paragraph",
      text: `Client: ${trail.clientName}. Artifacts: ${trail.artifactCount}. Entries: ${trail.entries.length}. Every change below is a commit in gitmatter's audit spine, attributed to the person or agent that made it.`,
    },
  ];
  // Group by artifact so the report reads document-by-document.
  const groups = new Map<string, AuditTrailEntry[]>();
  for (const e of trail.entries) {
    const key = `${e.artifactType}:${e.artifactId}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  for (const group of groups.values()) {
    const first = group[0]!;
    blocks.push({
      type: "heading",
      level: 2,
      text: `${first.artifactTitle} (${first.artifactType})`,
    });
    blocks.push({
      type: "table",
      rows: [
        ["When", "Actor", "Op", "Message", "Field", "After"],
        ...group.map((e) => [
          e.at.toISOString(),
          e.actor,
          e.op,
          e.message,
          e.path ?? "",
          clip(e.after),
        ]),
      ],
    });
  }
  return generateDocx({ title: `Audit trail — ${trail.matterName}`, blocks });
}
