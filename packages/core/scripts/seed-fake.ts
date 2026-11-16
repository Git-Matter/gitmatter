/**
 * Seed fake clients/matters/documents to test the table UIs.
 * Idempotent: every seeded client gets a `SEED-` clientNumber prefix; re-running
 * deletes prior seed clients first (matters/docs cascade off them).
 * Run: pnpm exec tsx packages/core/scripts/seed-fake.ts
 */
import { and, eq, like } from "drizzle-orm";
import { db, sql } from "@workspace/db/client";
import { clients, documents, matterMembers, matters, user } from "@workspace/db/schema";

const SEED_PREFIX = "SEED-";

const CLIENT_NAMES = [
  ["Apex Manufacturing Inc.", "organization"],
  ["Northwind Traders LLC", "organization"],
  ["Globex Corporation", "organization"],
  ["Stark Industries", "organization"],
  ["Wayne Enterprises", "organization"],
  ["Jane Doe", "individual"],
  ["John Smith", "individual"],
  ["Initech Software", "organization"],
  ["Soylent Group", "organization"],
  ["Maria Garcia", "individual"],
] as const;

const PRACTICE_AREAS = ["Corporate", "Litigation", "IP", "Employment", "Real Estate", "M&A"];
const MATTER_SUFFIX = [
  "Acquisition",
  "Dispute",
  "Licensing",
  "Compliance Review",
  "Lease",
  "Restructuring",
];
const FILE_TYPES = ["pdf", "docx", "txt", "xlsx"];
const DOC_STATUSES = ["ready", "ready", "ready", "processing", "pending", "failed"] as const;
const JURISDICTIONS = ["Delaware", "New York", "California", "England & Wales", null];
const DOC_TITLES = [
  "Engagement Letter",
  "Term Sheet",
  "Due Diligence Memo",
  "Board Minutes",
  "NDA",
  "Disclosure Schedule",
];
// Rows generated per tenant — large enough to stress the table UIs.
const CLIENTS_PER_TENANT = 2000;
const MATTERS_PER_TENANT = 2000;
const DOCS_PER_TENANT = 2000;
const pick = <T>(arr: readonly T[], i: number): T => arr[i % arr.length]!;
const rand = (n: number) => Math.floor(Math.random() * n);

async function seedForUser(u: { id: string; name: string; tenantId: string; email?: string }) {
  const tenantId = u.tenantId;

  // Clear prior seed data for this tenant (cascades to matters/docs).
  await db
    .delete(clients)
    .where(and(eq(clients.tenantId, tenantId), like(clients.clientNumber, `${SEED_PREFIX}%`)));

  const tag = u.id.slice(0, 4);

  // Clients.
  const clientRows = Array.from({ length: CLIENTS_PER_TENANT }, (_, i) => {
    const [name, type] = pick(CLIENT_NAMES, i);
    return {
      tenantId,
      name: `${name} ${i + 1}`,
      type,
      clientNumber: `${SEED_PREFIX}${tag}-${String(i + 1).padStart(5, "0")}`,
      status: i % 5 === 0 ? ("inactive" as const) : ("active" as const),
      createdBy: u.id,
    };
  });
  const clientIds: string[] = [];
  for (let i = 0; i < clientRows.length; i += 500) {
    const inserted = await db
      .insert(clients)
      .values(clientRows.slice(i, i + 500))
      .returning({ id: clients.id });
    clientIds.push(...inserted.map((r) => r.id));
  }

  // Matters — spread across the clients.
  const matterRows = Array.from({ length: MATTERS_PER_TENANT }, (_, i) => {
    const [name] = pick(CLIENT_NAMES, i);
    return {
      tenantId,
      clientId: pick(clientIds, i),
      name: `${name.split(" ")[0]} ${pick(MATTER_SUFFIX, i)} ${i + 1}`,
      practiceArea: pick(PRACTICE_AREAS, i),
      status: i % 4 === 0 ? ("closed" as const) : ("open" as const),
      leadAttorney: u.id,
      createdBy: u.id,
    };
  });
  const matterIds: string[] = [];
  for (let i = 0; i < matterRows.length; i += 500) {
    const inserted = await db
      .insert(matters)
      .values(matterRows.slice(i, i + 500))
      .returning({ id: matters.id });
    matterIds.push(...inserted.map((r) => r.id));
  }

  // Membership: list view inner-joins matter_members, so the user must be a
  // member of each matter to see it. Make the seeding user the owner.
  const memberRows = matterIds.map((matterId) => ({
    matterId,
    userId: u.id,
    role: "owner" as const,
  }));
  for (let i = 0; i < memberRows.length; i += 500) {
    await db.insert(matterMembers).values(memberRows.slice(i, i + 500));
  }

  // Spread DOCS_PER_TENANT documents across the matters; batch-insert in chunks.
  const docRows = Array.from({ length: DOCS_PER_TENANT }, (_, i) => {
    const status = pick(DOC_STATUSES, i);
    return {
      userId: u.id,
      tenantId,
      matterId: pick(matterIds, i),
      title: `${pick(DOC_TITLES, i)} #${i + 1}`,
      fileType: pick(FILE_TYPES, i),
      jurisdiction: pick(JURISDICTIONS, i),
      sizeBytes: 10_000 + rand(2_000_000),
      status,
      extractionError: status === "failed" ? "Extraction timed out" : null,
    };
  });
  for (let i = 0; i < docRows.length; i += 500) {
    await db.insert(documents).values(docRows.slice(i, i + 500));
  }

  console.log(
    `  ${u.email ?? u.id}: ${clientIds.length} clients, ${matterIds.length} matters, ${docRows.length} docs`
  );
}

const users = await db
  .select({ id: user.id, name: user.name, email: user.email, tenantId: user.tenantId })
  .from(user);

for (const u of users) {
  if (!u.tenantId) continue;
  console.log(`Seeding tenant ${u.tenantId}...`);
  await seedForUser({ id: u.id, name: u.name, tenantId: u.tenantId, email: u.email } as never);
}

await sql.end();
console.log("Done.");
process.exit(0);
