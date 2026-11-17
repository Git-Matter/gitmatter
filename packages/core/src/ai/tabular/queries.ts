import { and, asc, count, desc, eq, getTableColumns, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@workspace/db/client";
import {
  commits,
  documents,
  matterMembers,
  matters,
  tabularCells,
  tabularReviews,
  user,
} from "@workspace/db/schema";
import {
  accessCountSql,
  accessSummaryByArtifact,
  sharedArtifactIds,
} from "../../platform/shares.js";
import { quoteOnlyCitations } from "../../content/citations.js";

// Read side: list reviews (flat, or paginated with scope/sort/share counts) and
// load one full review with cells and per-cell blame.

export async function listReviews(userId: string) {
  return db.select().from(tabularReviews).where(eq(tabularReviews.userId, userId));
}

export type ReviewListSort = "title" | "matter" | "createdAt" | "documents" | "shared";

export type ReviewListScope = "all" | "mine" | "shared";

export type ReviewListParams = {
  q?: string;
  page: number;
  pageSize: number;
  sort?: ReviewListSort;
  dir?: "asc" | "desc";
  // mine = owned, shared = shared with me, all = owned + shared + matter-inherited.
  scope?: ReviewListScope;
};

export async function listReviewsPage(userId: string, params: ReviewListParams) {
  const q = params.q?.trim();
  const scope: ReviewListScope = params.scope ?? "all";
  const owned = eq(tabularReviews.userId, userId);
  const sharedIds = await sharedArtifactIds("tabular_review", userId);
  const sharedCond = sharedIds.length ? inArray(tabularReviews.id, sharedIds) : sql`false`;
  let scopeCond;
  if (scope === "mine") {
    scopeCond = owned;
  } else if (scope === "shared") {
    scopeCond = sharedCond;
  } else {
    const myMatters = db
      .select({ matterId: matterMembers.matterId })
      .from(matterMembers)
      .where(eq(matterMembers.userId, userId));
    scopeCond = or(owned, sharedCond, inArray(tabularReviews.matterId, myMatters));
  }
  const where = and(scopeCond, q ? ilike(tabularReviews.title, `%${q}%`) : undefined);
  const sortCols = {
    title: tabularReviews.title,
    matter: matters.name,
    createdAt: tabularReviews.createdAt,
    documents: sql`jsonb_array_length(${tabularReviews.documentIds})`,
    shared: accessCountSql({
      artifactType: "tabular_review",
      ownerId: tabularReviews.userId,
      matterId: tabularReviews.matterId,
      artifactId: tabularReviews.id,
    }),
  };
  const sortCol = sortCols[params.sort ?? "createdAt"];
  const order = params.dir === "asc" ? asc(sortCol) : desc(sortCol);
  const offset = params.page * params.pageSize;

  const [rows, countRows] = await Promise.all([
    db
      .select({ ...getTableColumns(tabularReviews), matterName: matters.name })
      .from(tabularReviews)
      .leftJoin(matters, eq(matters.id, tabularReviews.matterId))
      .where(where)
      .orderBy(order)
      .limit(params.pageSize)
      .offset(offset),
    db.select({ count: count() }).from(tabularReviews).where(where),
  ]);

  // Attach "people with access": owner + matter members + direct shares.
  const access = await accessSummaryByArtifact(
    "tabular_review",
    rows.map((r) => ({ id: r.id, matterId: r.matterId, ownerId: r.userId }))
  );
  const withShares = rows.map((r) => {
    const a = access.get(r.id);
    return {
      ...r,
      isOwner: r.userId === userId,
      shareCount: a?.count ?? 1,
      sharedNames: a?.names ?? [],
    };
  });

  return { rows: withShares, rowCount: Number(countRows[0]?.count ?? 0) };
}

/** Full review with cells and per-cell blame (commit that last set each cell). */
export async function getReview(reviewId: string) {
  const [review] = await db.select().from(tabularReviews).where(eq(tabularReviews.id, reviewId));
  if (!review) return null;

  const cells = await db
    .select()
    .from(tabularCells)
    .where(eq(tabularCells.reviewId, reviewId))
    .orderBy(asc(tabularCells.columnIndex));

  const commitIds = [...new Set(cells.map((c) => c.lastCommitId).filter((x): x is string => !!x))];
  const blameRows = commitIds.length
    ? await db
        .select({ ...getTableColumns(commits), actorName: user.name, actorEmail: user.email })
        .from(commits)
        .leftJoin(user, eq(user.id, commits.actorId))
        .where(inArray(commits.id, commitIds))
    : [];
  const blameById = new Map(blameRows.map((b) => [b.id, b]));

  // Title comes from the access-gated review payload, not the caller's owner-scoped
  // document list — collaborators don't own these docs, so a client lookup misses.
  const docRows = review.documentIds.length
    ? await db
        .select({ id: documents.id, title: documents.title, matterName: matters.name })
        .from(documents)
        .leftJoin(matters, eq(matters.id, documents.matterId))
        .where(inArray(documents.id, review.documentIds))
    : [];
  const documentTitles = Object.fromEntries(docRows.map((d) => [d.id, d.title]));
  // Origin matter per document; null when the document belongs to no matter.
  const documentMatters = Object.fromEntries(docRows.map((d) => [d.id, d.matterName ?? null]));

  return {
    review,
    cells: cells.map((c) => ({
      ...c,
      // Read projection only: legacy pages remain in their original audit records.
      citations: c.citations === null ? null : quoteOnlyCitations(c.citations),
      blame: c.lastCommitId ? (blameById.get(c.lastCommitId) ?? null) : null,
    })),
    documentTitles,
    documentMatters,
  };
}
