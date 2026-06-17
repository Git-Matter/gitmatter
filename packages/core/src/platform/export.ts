import JSZip from "jszip";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@workspace/db/client";
import { clients, documents, matters, tabularReviews } from "@workspace/db/schema";
import { type CsvValue, rowsToCsv } from "../core/csv.js";
import { buildReviewGrid, gridToCsv } from "../ai/tabular-export.js";

export type TenantExport = { filename: string; bytes: Uint8Array };

function csv(header: string[], rows: CsvValue[][]): string {
  return rowsToCsv([header, ...rows]);
}

/**
 * Build a per-tenant data export: a zip of CSVs for clients, matters, tabular
 * reviews (one CSV per review grid), and a documents manifest (metadata only,
 * no file bytes). Reuses the same CSV/grid helpers as the in-app exports.
 */
export async function buildTenantExport(tenantId: string): Promise<TenantExport> {
  const zip = new JSZip();

  const clientRows = await db.select().from(clients).where(eq(clients.tenantId, tenantId));
  zip.file(
    "clients.csv",
    csv(
      ["id", "name", "type", "clientNumber", "status", "createdAt"],
      clientRows.map((c) => [c.id, c.name, c.type, c.clientNumber, c.status, c.createdAt])
    )
  );

  const matterRows = await db.select().from(matters).where(eq(matters.tenantId, tenantId));
  zip.file(
    "matters.csv",
    csv(
      ["id", "name", "clientId", "practiceArea", "jurisdiction", "status", "createdAt"],
      matterRows.map((m) => [
        m.id,
        m.name,
        m.clientId,
        m.practiceArea,
        m.jurisdiction,
        m.status,
        m.createdAt,
      ])
    )
  );

  const docRows = await db
    .select()
    .from(documents)
    .where(and(eq(documents.tenantId, tenantId), isNull(documents.deletedAt)));
  zip.file(
    "documents-manifest.csv",
    csv(
      ["id", "title", "fileType", "status", "pageCount", "createdAt"],
      docRows.map((d) => [d.id, d.title, d.fileType, d.status, d.pageCount, d.createdAt])
    )
  );

  const reviewRows = await db
    .select({
      id: tabularReviews.id,
      title: tabularReviews.title,
      createdAt: tabularReviews.createdAt,
    })
    .from(tabularReviews)
    .where(eq(tabularReviews.tenantId, tenantId));
  zip.file(
    "reviews.csv",
    csv(
      ["id", "title", "createdAt"],
      reviewRows.map((r) => [r.id, r.title, r.createdAt])
    )
  );
  // Fetch the review grids concurrently — each is an independent query.
  const grids = await Promise.all(reviewRows.map((r) => buildReviewGrid(r.id)));
  reviewRows.forEach((r, i) => {
    const grid = grids[i];
    if (grid) zip.file(`reviews/${r.id}.csv`, gridToCsv(grid));
  });

  const bytes = await zip.generateAsync({ type: "uint8array" });
  return { filename: "tenant-export.zip", bytes };
}
