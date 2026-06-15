import * as XLSX from "xlsx";
import { eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db/client";
import { documents, tabularCells, tabularReviews } from "@workspace/db/schema";
import { rowsToCsv } from "../core/csv.js";

// Read-only serialization of a review grid (rows = documents, cols = columns).
// No commit — exporting doesn't change the artifact.

export type ReviewGrid = { title: string; headers: string[]; rows: string[][] };

export async function buildReviewGrid(reviewId: string): Promise<ReviewGrid | null> {
  const [review] = await db.select().from(tabularReviews).where(eq(tabularReviews.id, reviewId));
  if (!review) return null;

  const cells = await db.select().from(tabularCells).where(eq(tabularCells.reviewId, reviewId));
  const docs = review.documentIds.length
    ? await db
        .select({ id: documents.id, title: documents.title })
        .from(documents)
        .where(inArray(documents.id, review.documentIds))
    : [];
  const titleById = new Map(docs.map((d) => [d.id, d.title]));

  const cols = [...review.columnsConfig].sort((a, b) => a.index - b.index);
  const headers = ["Document", ...cols.map((c) => c.name)];
  const rows = review.documentIds.map((docId) => {
    const row = [titleById.get(docId) ?? docId];
    for (const col of cols) {
      const cell = cells.find((c) => c.documentId === docId && c.columnIndex === col.index);
      row.push(cell?.content?.summary ?? "");
    }
    return row;
  });
  return { title: review.title, headers, rows };
}

export function gridToCsv(grid: ReviewGrid): string {
  return rowsToCsv([grid.headers, ...grid.rows]);
}

export function gridToXlsx(grid: ReviewGrid): Uint8Array {
  const ws = XLSX.utils.aoa_to_sheet([grid.headers, ...grid.rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Review");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Uint8Array;
}
