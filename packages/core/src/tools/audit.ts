import { z } from "zod";
import {
  type Actor,
  canAccessArtifact,
  deriveBlame,
  diffCommits,
  getCommit,
  getCommitChanges,
  hasMatterAccess,
  listCommits,
} from "../core/index.js";
import { auditTrailToCsv, gatherMatterAudit } from "../content/auditExport.js";
import type { ToolSpec } from "./types.js";

// Git audit spine: blame/history/diff over ANY artifact. Every mutation (human
// route or agent tool) is a commit attributed to an actor (a user, or an agent
// with its label — e.g. "mcp:<token>" or "chat"). These tools let an inbound
// agent see who changed what, exactly, and with what.
const ARTIFACT_TYPES = ["tabular_review", "workflow", "document"] as const;
const artifactType = z.enum(ARTIFACT_TYPES);
type ArtifactKind = (typeof ARTIFACT_TYPES)[number];

export function buildAuditTools({ actor }: { actor: Actor }): ToolSpec[] {
  const canRead = (kind: ArtifactKind, id: string) => canAccessArtifact(actor, kind, id);
  return [
    {
      name: "history",
      description:
        "List an artifact's commit history (newest first): seq, actor (user or agent + label), op, and message. artifactType: tabular_review | workflow | document.",
      schema: { artifactType, artifactId: z.string() },
      handler: async ({ artifactType: kind, artifactId }) =>
        (await canRead(kind as ArtifactKind, artifactId as string))
          ? listCommits(kind as ArtifactKind, artifactId as string)
          : { error: "Not found" },
    },
    {
      name: "diff",
      description: "Field-level diff of an artifact between two commit sequence numbers.",
      schema: {
        artifactType,
        artifactId: z.string(),
        fromSeq: z.number(),
        toSeq: z.number(),
      },
      handler: async ({ artifactType: kind, artifactId, fromSeq, toSeq }) =>
        (await canRead(kind as ArtifactKind, artifactId as string))
          ? diffCommits(
              kind as ArtifactKind,
              artifactId as string,
              fromSeq as number,
              toSeq as number
            )
          : { error: "Not found" },
    },
    {
      name: "blame",
      description:
        "Which commit last set a given field path — who did it, when, and how. Path examples: cell/<documentId>/<columnIndex> (review), field/prompt_md (workflow), markdown (document).",
      schema: { artifactType, artifactId: z.string(), path: z.string() },
      handler: async ({ artifactType: kind, artifactId, path }) =>
        (await canRead(kind as ArtifactKind, artifactId as string))
          ? deriveBlame(kind as ArtifactKind, artifactId as string, path as string)
          : { error: "Not found" },
    },
    {
      name: "export_audit",
      description:
        "Export a matter's complete audit trail as CSV: every commit on every artifact in the matter, one row per field change, with actor attribution.",
      schema: { matterId: z.string() },
      handler: async ({ matterId }) => {
        if (!(await hasMatterAccess(actor, matterId as string))) return { error: "Not found" };
        const trail = await gatherMatterAudit(matterId as string);
        if (!trail) return { error: "Not found" };
        // Inline CSV suits agent contexts only up to a point; past that, the
        // web export endpoint is the right tool.
        if (trail.entries.length > 2000)
          return {
            error: `Audit trail too large for inline export (${trail.entries.length} entries). Download it from the matter page instead.`,
          };
        return {
          matterName: trail.matterName,
          clientName: trail.clientName,
          entries: trail.entries.length,
          csv: auditTrailToCsv(trail),
        };
      },
    },
    {
      name: "show_commit",
      description:
        "Full detail of one commit: the actor (user or agent + label), op, message, and every field change (before → after). The complete 'who did what, exactly, with what'.",
      schema: { commitId: z.string() },
      handler: async ({ commitId }) => {
        const commit = await getCommit(commitId as string);
        if (!commit || !(await canRead(commit.artifactType, commit.artifactId)))
          return { error: "Not found" };
        return { commit, changes: await getCommitChanges(commitId as string) };
      },
    },
  ];
}
