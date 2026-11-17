import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db, type Tx } from "@workspace/db/client";
import {
  documents,
  hiddenWorkflows,
  matterDocuments,
  matterMembers,
  matters,
  mcpAccessTokens,
  oauthAccessTokens,
  oauthClients,
  tabularCells,
  tabularReviews,
  tenants,
  user,
  userApiKeys,
  workflows,
} from "@workspace/db/schema";
import type { FirstReviewStatus, LlmProvider } from "@workspace/contracts";
import type { Actor } from "./commit.js";
import { canAccessArtifact, canReadDocument, hasMatterAccess } from "./access.js";
import { canReadApprovedLibrary } from "./library-access.js";
import { getReviewCompletion } from "../ai/tabular/contract-review.js";
import { envProviderStatus } from "../ai/provider/keys.js";
import { LLM_MODELS, PROVIDERS, PROVIDER_LABELS } from "../ai/provider/catalog.js";

const LIST_LIMIT = 100;
const RECENT_USE_MS = 24 * 60 * 60 * 1000;

/** Apply the shared document guard before counting/limiting visible sources. */
async function readableSources(tx: Tx, actor: Actor, tenantId: string, matterId: string) {
  type Source = Pick<
    typeof documents.$inferSelect,
    "id" | "title" | "fileType" | "status" | "markdown" | "createdAt"
  > & { versionId: string | null };
  const visible: Source[] = [];
  let cursor: Pick<Source, "createdAt" | "id"> | undefined;
  for (let pageIndex = 0; pageIndex < 10; pageIndex++) {
    const page: Source[] = await tx
      .select({
        id: documents.id,
        title: documents.title,
        fileType: documents.fileType,
        status: documents.status,
        markdown: documents.markdown,
        versionId: documents.currentVersionId,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .innerJoin(matterDocuments, eq(matterDocuments.documentId, documents.id))
      .where(
        and(
          eq(matterDocuments.matterId, matterId),
          eq(documents.tenantId, tenantId),
          isNull(documents.deletedAt),
          eq(documents.staged, false),
          cursor
            ? or(
                lt(documents.createdAt, cursor.createdAt),
                and(eq(documents.createdAt, cursor.createdAt), lt(documents.id, cursor.id))
              )
            : undefined
        )
      )
      .orderBy(desc(documents.createdAt), desc(documents.id))
      .limit(LIST_LIMIT);
    for (const document of page) {
      if (await canReadDocument(actor, document.id, tx)) visible.push(document);
      if (visible.length > LIST_LIMIT) return { rows: visible, incomplete: false };
    }
    if (page.length < LIST_LIMIT) return { rows: visible, incomplete: false };
    cursor = page.at(-1);
  }
  return { rows: visible, incomplete: true };
}

/** Derived progress never provisions accounts, runs models, or treats a draft as approved. */
export async function getFirstReviewStatus(
  actor: Actor,
  input: { matterId?: string } = {}
): Promise<FirstReviewStatus> {
  // The existing probe exposes booleans only. User key ciphertext is never selected or decrypted.
  const environment = envProviderStatus();
  return db.transaction(
    async (tx) => {
      const [account] = await tx
        .select({
          tenantId: user.tenantId,
          tenantRole: user.tenantRole,
          name: tenants.name,
          storageRegion: tenants.storageRegion,
        })
        .from(user)
        .innerJoin(tenants, sql`${tenants.id}::text = ${user.tenantId}`)
        .where(eq(user.id, actor.userId));
      if (!account?.tenantId) throw new Error("access_denied");
      const scope = actor.type === "agent" ? (actor.scope ?? null) : null;
      const visibleMatters = await tx
        .select({ id: matters.id, name: matters.name, role: matterMembers.role })
        .from(matters)
        .innerJoin(matterMembers, eq(matterMembers.matterId, matters.id))
        .where(
          and(
            eq(matters.tenantId, account.tenantId),
            eq(matterMembers.userId, actor.userId),
            scope?.matterIds ? inArray(matters.id, scope.matterIds) : undefined
          )
        )
        .orderBy(desc(matters.updatedAt))
        .limit(LIST_LIMIT + 1);
      const matterChoices = visibleMatters.slice(0, LIST_LIMIT).map((matter) => ({
        id: matter.id,
        name: matter.name,
        canEdit: matter.role !== "viewer" && scope?.maxRole !== "viewer",
      }));
      let selected: FirstReviewStatus["matter"] = null;
      if (input.matterId) {
        if (!(await hasMatterAccess(actor, input.matterId, "viewer", tx)))
          throw new Error("access_denied");
        const [matter] = await tx
          .select({ id: matters.id, name: matters.name })
          .from(matters)
          .where(eq(matters.id, input.matterId));
        if (!matter) throw new Error("access_denied");
        selected = { ...matter, canEdit: await hasMatterAccess(actor, matter.id, "editor", tx) };
        // An explicit, permitted matter stays selectable even beyond the bounded recent list.
        if (!matterChoices.some((choice) => choice.id === selected!.id))
          matterChoices.push(selected);
      }
      const keyRows = await tx
        .select({ provider: userApiKeys.provider })
        .from(userApiKeys)
        .where(eq(userApiKeys.userId, actor.userId));
      const configured = new Set(keyRows.map((key) => key.provider));
      const providers = (Object.keys(PROVIDERS) as LlmProvider[]).map((provider) => {
        const source = configured.has(provider)
          ? ("user" as const)
          : environment[provider]
            ? ("env" as const)
            : null;
        return {
          provider,
          label: PROVIDER_LABELS[provider],
          available: source !== null,
          source,
          models: LLM_MODELS.filter((model) => model.provider === provider),
        };
      });
      const status: FirstReviewStatus = {
        capturedAt: new Date().toISOString(),
        organization: {
          name: account.name,
          storageRegion: account.storageRegion,
          canPublishFirmStandard: actor.type === "user" && account.tenantRole === "admin",
        },
        matters: matterChoices,
        mattersTruncated: visibleMatters.length > LIST_LIMIT,
        matter: selected,
        application: { providers, verification: "configuration_only" },
        agent: { connections: [], recentlyUsed: false },
        playbooks: [],
        playbooksTruncated: false,
        documents: [],
        documentsTruncated: false,
        documentsSearchIncomplete: false,
        reviewSearchIncomplete: false,
        review: null,
      };
      if (!selected) return status;
      const matterId = selected.id;
      const [staticConnections, oauthConnections, playbookRows, documentRows, reviewRows] =
        await Promise.all([
          tx
            .select({ label: mcpAccessTokens.label, lastUsedAt: mcpAccessTokens.lastUsedAt })
            .from(mcpAccessTokens)
            .where(
              and(
                eq(mcpAccessTokens.userId, actor.userId),
                isNull(mcpAccessTokens.revokedAt),
                or(isNull(mcpAccessTokens.maxRole), sql`${mcpAccessTokens.maxRole} <> 'viewer'`),
                or(
                  isNull(mcpAccessTokens.allowedMatterIds),
                  sql`${mcpAccessTokens.allowedMatterIds} @> ${JSON.stringify([matterId])}::jsonb`
                )
              )
            )
            .orderBy(desc(mcpAccessTokens.lastUsedAt))
            .limit(LIST_LIMIT),
          tx
            .select({ label: oauthClients.clientName, lastUsedAt: oauthAccessTokens.lastUsedAt })
            .from(oauthAccessTokens)
            .innerJoin(oauthClients, eq(oauthClients.clientId, oauthAccessTokens.clientId))
            .where(
              and(
                eq(oauthAccessTokens.userId, actor.userId),
                isNull(oauthAccessTokens.revokedAt),
                gt(oauthAccessTokens.expiresAt, new Date())
              )
            )
            .orderBy(desc(oauthAccessTokens.lastUsedAt))
            .limit(LIST_LIMIT),
          tx
            .select({ id: workflows.id, title: workflows.title, rules: workflows.rules })
            .from(workflows)
            .leftJoin(
              hiddenWorkflows,
              and(
                eq(hiddenWorkflows.workflowId, workflows.id),
                eq(hiddenWorkflows.userId, actor.userId)
              )
            )
            .where(
              and(
                eq(workflows.type, "playbook"),
                eq(workflows.status, "approved"),
                eq(workflows.isSystem, false),
                eq(workflows.tenantId, account.tenantId),
                or(isNull(workflows.matterId), eq(workflows.matterId, matterId)),
                isNull(hiddenWorkflows.workflowId),
                sql`jsonb_array_length(coalesce(${workflows.rules}, '[]'::jsonb)) > 0`
              )
            )
            .orderBy(desc(workflows.updatedAt))
            .limit(LIST_LIMIT + 1),
          readableSources(tx, actor, account.tenantId, matterId),
          tx
            .select({
              id: tabularReviews.id,
              title: tabularReviews.title,
              snapshot: tabularReviews.inputSnapshot,
            })
            .from(tabularReviews)
            .where(
              and(
                eq(tabularReviews.matterId, matterId),
                eq(tabularReviews.tenantId, account.tenantId),
                isNotNull(tabularReviews.inputSnapshot),
                sql`jsonb_array_length(coalesce(${tabularReviews.inputSnapshot}->'rules', '[]'::jsonb)) > 0`,
                sql`jsonb_array_length(coalesce(${tabularReviews.inputSnapshot}->'documents', '[]'::jsonb)) > 0`
              )
            )
            .orderBy(desc(tabularReviews.createdAt), desc(tabularReviews.id))
            .limit(21),
        ]);
      if (selected.canEdit) {
        status.agent.connections = [
          ...staticConnections.map((connection) => ({
            label: connection.label,
            kind: "static" as const,
            lastUsedAt: connection.lastUsedAt?.toISOString() ?? null,
          })),
          ...oauthConnections.map((connection) => ({
            label: connection.label,
            kind: "oauth" as const,
            lastUsedAt: connection.lastUsedAt?.toISOString() ?? null,
          })),
        ];
        status.agent.recentlyUsed = status.agent.connections.some(
          (connection) =>
            connection.lastUsedAt !== null &&
            Date.parse(connection.lastUsedAt) >= Date.now() - RECENT_USE_MS
        );
      }
      status.playbooksTruncated = playbookRows.length > LIST_LIMIT;
      for (const playbook of playbookRows.slice(0, LIST_LIMIT)) {
        if (
          playbook.rules?.length &&
          (await canReadApprovedLibrary(actor, "workflow", playbook.id, matterId, tx))
        )
          status.playbooks.push({
            id: playbook.id,
            title: playbook.title,
            ruleCount: playbook.rules.length,
          });
      }
      status.documentsTruncated = documentRows.rows.length > LIST_LIMIT;
      status.documentsSearchIncomplete = documentRows.incomplete;
      for (const document of documentRows.rows.slice(0, LIST_LIMIT)) {
        status.documents.push({
          id: document.id,
          title: document.title,
          fileType: document.fileType,
          status: document.status,
          ready: document.status === "ready" && !!document.markdown?.trim(),
          uploaded: document.versionId !== null,
        });
      }
      for (const latest of reviewRows.slice(0, 20)) {
        if (
          !latest.snapshot ||
          !(await canAccessArtifact(actor, "tabular_review", latest.id, "viewer", tx))
        )
          continue;
        let readable = true;
        for (const source of latest.snapshot.documents) {
          if (!(await canReadDocument(actor, source.id, tx))) {
            readable = false;
            break;
          }
        }
        if (!readable) continue;
        const completion = await getReviewCompletion(actor, latest.id, tx);
        if (completion) {
          const cells = await tx
            .select({ status: tabularCells.status })
            .from(tabularCells)
            .where(eq(tabularCells.reviewId, latest.id));
          status.review = {
            id: latest.id,
            title: latest.title,
            instructionsCaptured: latest.snapshot.revision === 2,
            totalFindings: latest.snapshot.documents.length * latest.snapshot.rules.length,
            completedFindings: cells.filter((cell) => cell.status === "done").length,
            failedFindings: cells.filter((cell) => cell.status === "error").length,
            unresolvedFindings: completion.documents.reduce(
              (total, document) => total + document.unresolved,
              0
            ),
            pendingEdits: completion.documents.reduce(
              (total, document) => total + document.pendingEdits,
              0
            ),
            pendingApprovals: completion.documents.reduce(
              (total, document) => total + document.pendingApprovals,
              0
            ),
            sourceChanged: completion.documents.some((document) => document.sourceChanged),
            decisionsComplete: completion.decisionsComplete,
            cleanReady: completion.cleanReady,
          };
          break;
        }
      }
      status.reviewSearchIncomplete = !status.review && reviewRows.length > 20;
      return status;
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}
