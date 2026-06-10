import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { db, sql } from "@workspace/db/client";
import { contracts, user } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { listCommits } from "../src/core/commit.js";
import {
  createContractFromDocx,
  getContract,
  proposeEdit,
  resolveEdit,
} from "../src/content/contract.js";

const userId = `test-user-${randomUUID()}`;
const actor = { type: "user", userId } as const;
const fixture = (): Buffer =>
  readFileSync(fileURLToPath(new URL("./fixtures/single-paragraph.docx", import.meta.url)));

let contractId: string;

beforeAll(async () => {
  await db.insert(user).values({
    id: userId,
    name: "Test User",
    email: `${userId}@example.com`,
    emailVerified: true,
  });
});

afterAll(async () => {
  await db.delete(contracts).where(eq(contracts.userId, userId));
  await db.delete(user).where(eq(user.id, userId));
  await sql.end();
});

describe("contract DOCX redline through the commit spine", () => {
  test("upload creates a versioned docx contract", async () => {
    contractId = await createContractFromDocx(actor, { title: "NDA", bytes: fixture() });
    const result = await getContract(contractId);
    expect(result).not.toBeNull();
    expect(result!.contract.body).toContain("imported air");
    expect(result!.contract.currentVersionId).not.toBeNull();
    expect(result!.edits).toHaveLength(0);
  });

  test("propose routes through the OOXML engine and records a pending edit", async () => {
    await proposeEdit(actor, contractId, { find: "imported", replace: "global" });
    const result = await getContract(contractId);
    expect(result!.edits).toHaveLength(1);
    const edit = result!.edits[0]!;
    expect(edit.status).toBe("pending");
    expect(edit.deletedText).toBe("imported");
    expect(edit.insertedText).toBe("global");
    expect(edit.blame).not.toBeNull(); // last_commit_id resolves
  });

  test("accept finalizes the change in the document body", async () => {
    const result0 = await getContract(contractId);
    const changeId = result0!.edits[0]!.changeId;
    await resolveEdit(actor, contractId, changeId, "accept");
    const result = await getContract(contractId);
    expect(result!.edits[0]!.status).toBe("accepted");
    expect(result!.contract.body).toContain("global");
    expect(result!.contract.body).not.toContain("imported");
  });

  test("every mutation is a linear commit", async () => {
    const commitList = await listCommits("contract", contractId);
    // create + propose + resolve
    expect(commitList).toHaveLength(3);
    expect(commitList.map((c) => c.op)).toEqual(["resolve_edit", "propose_edit", "create"]);
  });
});
