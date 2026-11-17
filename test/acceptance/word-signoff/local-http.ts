import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { strict as assert } from "node:assert";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectDocx } from "../../../packages/core/src/content/docx/inspection.js";
import { extractDocxBodyText } from "../../../packages/core/src/content/docx/trackedChanges.js";

// Explicit loopback-only authenticated acceptance. No env files, raw database
// writes, browser control, model calls, password handling or account creation.
const origin = "http://127.0.0.1:4280";
const [cookieFile, outputArg] = process.argv.slice(2);
const styledSource = process.argv.includes("--styled-source");
if (!cookieFile || !outputArg)
  throw new Error("Usage: local-http.ts <private-cookie-file> <ignored-output-directory>");
assert.equal((await stat(cookieFile)).mode & 0o077, 0, "Cookie file must be private");
const { cookieHeader } = JSON.parse(await readFile(cookieFile, "utf8")) as { cookieHeader: string };
assert(
  typeof cookieHeader === "string" && cookieHeader.length > 0 && !/[\r\n]/.test(cookieHeader),
  "Invalid private cookie format"
);
const output = resolve(outputArg);
assert(output.includes("/.scratch/"), "Acceptance evidence must remain in ignored scratch storage");
await mkdir(output, { recursive: true, mode: 0o700 });
const root = new URL("../../../", import.meta.url);
const fixtureRoot = new URL("./fixtures/", import.meta.url);
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const ledger: Record<string, unknown> = {
  evidence:
    "Actual authenticated local HTTP/MCP operations on fictional data; scripted synthetic-account actions, not provider output or independent human legal review.",
  date: "2026-10-15",
  origin,
  checks: [],
  documents: {},
  outputs: [],
};
const checks = ledger.checks as Array<Record<string, unknown>>;
const downloads = ledger.outputs as Array<Record<string, unknown>>;
let phase = "initialise";
let cleanOriginal: Buffer | undefined;
async function persist() {
  await writeFile(join(output, "receipt.json"), `${JSON.stringify(ledger, null, 2)}\n`, {
    mode: 0o600,
  });
}
async function request(path: string, init: RequestInit = {}) {
  assert(path.startsWith("/api/"), "Only local application API requests are allowed");
  const headers = new Headers({ Cookie: cookieHeader, Origin: origin });
  new Headers(init.headers).forEach((value, name) => headers.set(name, value));
  return fetch(`${origin}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(30000),
    redirect: "error",
  });
}
async function json(path: string, method = "GET", body?: unknown): Promise<any> {
  const response = await request(path, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }
      : {}),
  });
  if (!response.ok) throw new Error(`Local ${method} ${path} failed with HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}
async function detail(id: string) {
  return json(`/api/documents/${id}`);
}
async function download(id: string, filename: string, query = "") {
  const response = await request(`/api/documents/${id}/download${query}`);
  assert.equal(response.status, 200, `Download ${filename}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const inspection = await inspectDocx(bytes);
  assert.equal(inspection.status, "complete", `Downloaded package ${filename}`);
  let preservedUnrelatedParts: number | undefined;
  if (cleanOriginal && id === (ledger.documents as Record<string, { id: string }>).clean?.id) {
    const requireCore = createRequire(
      new URL("../../../packages/core/package.json", import.meta.url)
    );
    const { default: JSZip } = await import(requireCore.resolve("jszip"));
    const sourceZip = await JSZip.loadAsync(cleanOriginal),
      resultZip = await JSZip.loadAsync(bytes);
    const paths = Object.keys(sourceZip.files).filter(
      (path) => !sourceZip.files[path].dir && path !== "word/document.xml"
    );
    for (const path of paths)
      assert(
        (await sourceZip.file(path).async("nodebuffer")).equals(
          await resultZip.file(path).async("nodebuffer")
        ),
        `Unrelated package part changed in ${filename}`
      );
    preservedUnrelatedParts = paths.length;
  }
  await writeFile(join(output, filename), bytes, { mode: 0o600 });
  const receipt = {
    file: filename,
    sha256: hash(bytes),
    sizeBytes: bytes.length,
    documentId: id,
    versionId: response.headers.get("x-gitmatter-document-version"),
    documentCommitId: response.headers.get("x-gitmatter-document-commit"),
    reviewCommitId: response.headers.get("x-gitmatter-review-commit"),
    revisions: inspection.revisions,
    reasons: inspection.reasons,
    preservedUnrelatedParts,
  };
  downloads.push(receipt);
  await persist();
  return bytes;
}
async function upload(path: URL, title: string, matterId: string) {
  const bytes = await readFile(path);
  const form = new FormData();
  form.set(
    "file",
    new File([bytes], title, {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    })
  );
  form.set("matterId", matterId);
  form.set("title", title);
  const response = await request("/api/documents/upload", { method: "POST", body: form });
  assert.equal(response.status, 202, "Upload accepted");
  const created = (await response.json()) as { id: string };
  for (let n = 0; n < 60; n++) {
    const current = await detail(created.id);
    if (current.document.status === "failed")
      throw new Error(`Extraction failed for synthetic document ${created.id}`);
    if (current.document.status === "ready") return { current, originalHash: hash(bytes) };
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Local extraction did not reach ready within acceptance deadline");
}

let tokenId: string | undefined;
let mcpClient: { close(): Promise<void> } | undefined;
try {
  const session = await json("/api/auth/get-session");
  assert(session?.user?.id, "Authenticated synthetic session required");
  ledger.actorId = session.user.id;
  phase = "create separate synthetic workspace";
  const client = await json("/api/clients", "POST", {
    name: `Synthetic Word HTTP acceptance ${randomUUID().slice(0, 8)}`,
  });
  const matter = await json("/api/matters", "POST", {
    clientId: client.id,
    name: "Synthetic Word intake and mixed decisions",
  });
  ledger.clientId = client.id;
  ledger.matterId = matter.id;
  await persist();
  console.log(`Created separate Word acceptance matter ${matter.id}.`);

  phase = "upload clean source";
  const sourceUrl = styledSource
    ? new URL("01-clean-styled-nda.docx", fixtureRoot)
    : new URL("packages/core/test/fixtures/nda/source.docx", root);
  const clean = await upload(
    sourceUrl,
    styledSource ? "Word HTTP styled synthetic NDA.docx" : "Word HTTP original synthetic NDA.docx",
    matter.id
  );
  const documentId = clean.current.document.id;
  assert.equal(clean.current.wordInspection.safeToEdit, true);
  assert.equal(clean.current.wordInspection.safeClean, true);
  ledger.documents = {
    clean: {
      id: documentId,
      originalVersionId: clean.current.document.currentVersionId,
      originalHash: clean.originalHash,
    },
  };
  cleanOriginal = await readFile(sourceUrl);
  ledger.sourceFixture = fileURLToPath(sourceUrl);
  assert.equal(
    hash(await download(documentId, "01-actual-uploaded-original.docx")),
    clean.originalHash
  );
  checks.push({
    check: "clean source inspection and original-byte preservation",
    result: "passed",
  });

  for (const [key, file] of [
    ["incomingBody", "02-incoming-body-revisions.docx"],
    ["incomingNonbody", "03-incoming-nonbody-revisions.docx"],
  ] as const) {
    phase = `inspect ${key}`;
    const incoming = await upload(new URL(file, fixtureRoot), `Word HTTP ${file}`, matter.id);
    const id = incoming.current.document.id;
    assert.equal(incoming.current.wordInspection.safeToEdit, false);
    assert.equal(incoming.current.wordInspection.safeClean, false);
    assert.equal(incoming.current.resolutionPolicy.mayPropose, false);
    assert.equal(incoming.current.resolutionPolicy.mayResolve, false);
    const before = incoming.current.document.headCommitId;
    const denied = await request(`/api/documents/${id}/edits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        find: "Confidentiality",
        replace: "Synthetic replacement",
        reason: "Authored fixture denial test",
      }),
    });
    assert.equal(denied.status, 400);
    assert.equal((await detail(id)).document.headCommitId, before);
    assert.equal(hash(await download(id, `${key}-preserved-original.docx`)), incoming.originalHash);
    (ledger.documents as Record<string, unknown>)[key] = {
      id,
      versionId: incoming.current.document.currentVersionId,
      sourceHash: incoming.originalHash,
      inspection: incoming.current.wordInspection,
      deniedEditStatus: denied.status,
    };
    checks.push({
      check: `${key}: bound inspection, denied edit with unchanged head, original bytes`,
      result: "passed",
    });
    await persist();
  }

  phase = "publish two actual tracked proposals";
  const manifest = JSON.parse(
    await readFile(new URL("packages/core/test/fixtures/nda/manifest.json", root), "utf8")
  ) as { redlines: Array<{ find: string; replace: string; ruleId: string }> };
  let current = clean.current;
  for (const redline of manifest.redlines)
    current = await json(`/api/documents/${documentId}/edits`, "POST", {
      find: redline.find,
      replace: redline.replace,
      reason: `Authored synthetic HTTP acceptance, ${redline.ruleId}; no provider inference`,
    });
  assert.equal(current.edits.filter((edit: any) => edit.status === "pending").length, 2);
  assert.equal(current.wordInspection.registeredRevisions, 4);
  assert.equal(current.wordInspection.incomingRevisions, 0);
  assert.equal(current.wordInspection.safeToEdit, true);
  await download(documentId, "02-actual-app-two-pending-proposals.docx", "?output=tracked");
  const edits = current.edits.filter((edit: any) => edit.status === "pending");
  const term = edits.find((edit: any) => edit.reason?.includes("term")),
    disclosure = edits.find((edit: any) => edit.reason?.includes("disclosure"));
  assert(term && disclosure);
  current = await json(`/api/documents/${documentId}/edits/${term.changeId}/resolve`, "POST", {
    decision: "accept",
    expectedHeadCommitId: current.document.headCommitId,
    approvalContext: current.resolutionPolicy.approvalContext,
  });
  assert.equal(current.wordInspection.registeredRevisions, 2);
  await download(documentId, "03-actual-app-partial-term-accepted.docx", "?output=tracked");
  current = await json(
    `/api/documents/${documentId}/edits/${disclosure.changeId}/resolve`,
    "POST",
    {
      decision: "reject",
      expectedHeadCommitId: current.document.headCommitId,
      approvalContext: current.resolutionPolicy.approvalContext,
    }
  );
  assert.equal(current.wordInspection.safeClean, true);
  const mixed = await download(documentId, "04-actual-app-mixed-decisions-resolved.docx");
  const mixedText = await extractDocxBodyText(mixed);
  assert(mixedText.includes(manifest.redlines[0]!.replace));
  assert(mixedText.includes(manifest.redlines[1]!.find));
  const history = await json(`/api/documents/${documentId}/history`);
  assert(history.filter((entry: any) => entry.op === "propose_edit").length === 2);
  assert(
    history.filter((entry: any) => entry.op === "resolve_edit" && entry.actorType === "user")
      .length === 2
  );
  ledger.documentHistory = history.map((entry: any) => ({
    id: entry.id,
    seq: entry.seq,
    actorType: entry.actorType,
    actorId: entry.actorId,
    op: entry.op,
  }));
  ledger.decisions = {
    term: { changeId: term.changeId, decision: "accept" },
    disclosure: { changeId: disclosure.changeId, decision: "reject" },
    finalVersionId: current.document.currentVersionId,
    finalHeadCommitId: current.document.headCommitId,
  };
  checks.push({
    check: "two audited proposals, partial acceptance, mixed resolution and original legal wording",
    result: "passed",
  });
  await persist();
  console.log(
    `Actual pending and mixed-decision Word files downloaded for document ${documentId}.`
  );

  phase = "prepare source-current synthetic review for clean export";
  const createdWorkflow = await json("/api/workflows", "POST", {
    title: "Synthetic Word output plumbing - authored checks only",
    type: "playbook",
    promptMd: "Software acceptance only, not a legal opinion.",
    rules: [
      {
        id: "word-purpose-preserved",
        clauseType: "Synthetic permitted-use presence",
        standardPosition:
          "Each party may use confidential information only to evaluate the collaboration.",
        severity: "yellow",
      },
    ],
  });
  const workflowId = createdWorkflow.workflow.id;
  await json(`/api/workflows/${workflowId}`, "PATCH", { status: "approved" });
  const prepared = await json(`/api/workflows/${workflowId}/run-playbook`, "POST", {
    matterId: matter.id,
    documentIds: [documentId],
    requestId: randomUUID(),
    reviewInstructions: {
      representedParty: "Fictional acceptance party",
      disclosureRole: "both",
      ndaStructure: "mutual",
      businessPurpose: "Software Word-output acceptance only",
      governingLaw: null,
    },
  });
  ledger.playbookId = workflowId;
  ledger.reviewId = prepared.reviewId;

  phase = "author scoped synthetic MCP finding without inference";
  const label = `word-http-authored-${randomUUID().slice(0, 8)}`;
  const minted = await json("/api/mcp-tokens", "POST", {
    label,
    allowedMatterIds: [matter.id],
    maxRole: "editor",
  });
  const tokens = await json("/api/mcp-tokens");
  tokenId = tokens.find((token: any) => token.label === label)?.id;
  assert(tokenId, "Temporary scope receipt missing");
  const requireCore = createRequire(
    new URL("../../../packages/core/package.json", import.meta.url)
  );
  const { Client } = await import(requireCore.resolve("@modelcontextprotocol/sdk/client/index.js"));
  const { StreamableHTTPClientTransport } = await import(
    requireCore.resolve("@modelcontextprotocol/sdk/client/streamableHttp.js")
  );
  const clientMcp = new Client({ name: "synthetic-word-http-acceptance", version: "1" });
  mcpClient = clientMcp;
  await clientMcp.connect(
    new StreamableHTTPClientTransport(new URL(`${origin}/api/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${minted.token}` } },
    })
  );
  const written = await clientMcp.callTool({
    name: "write_cell",
    arguments: {
      reviewId: prepared.reviewId,
      documentId,
      columnIndex: 0,
      summary: "Synthetic reference phrase preserved",
      flag: "green",
      outcome: "conforms",
      reasoning:
        "Authored software fixture assertion only. No model/provider call or legal-quality evaluation.",
      citations: [
        {
          quote: "Each party may use confidential information only to evaluate the collaboration.",
        },
      ],
    },
  });
  assert.equal(written.isError, false, "Authored scoped finding failed");
  for (const key of ["incomingBody", "incomingNonbody"]) {
    const incomingId = (ledger.documents as Record<string, { id: string }>)[key]!.id;
    const incomingReview = await json(`/api/workflows/${workflowId}/run-playbook`, "POST", {
      matterId: matter.id,
      documentIds: [incomingId],
      requestId: randomUUID(),
      reviewInstructions: {
        representedParty: "Fictional acceptance party",
        disclosureRole: "both",
        ndaStructure: "mutual",
        businessPurpose: "Completed-finding Word safety denial check only",
        governingLaw: null,
      },
    });
    const authored = await clientMcp.callTool({
      name: "write_cell",
      arguments: {
        reviewId: incomingReview.reviewId,
        documentId: incomingId,
        columnIndex: 0,
        summary: "Synthetic reference phrase preserved",
        flag: "green",
        outcome: "conforms",
        reasoning:
          "Authored fixture only; finishing findings must not bypass incoming Word safety.",
        citations: [
          {
            quote:
              "Each party may use confidential information only to evaluate the collaboration.",
          },
        ],
      },
    });
    assert.equal(authored.isError, false);
    const incomingCompletion = await json(
      `/api/tabular/reviews/${incomingReview.reviewId}/completion`
    );
    assert.equal(incomingCompletion.decisionsComplete, true);
    assert.equal(incomingCompletion.cleanReady, false);
    const deniedExport = await request(
      `/api/documents/${incomingId}/download?output=clean&reviewId=${incomingReview.reviewId}`
    );
    const deniedRequest = await request(`/api/documents/${incomingId}/clean-export-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: randomUUID(), reviewId: incomingReview.reviewId }),
    });
    assert.equal(deniedExport.status, 409);
    assert.equal(deniedRequest.status, 409);
    checks.push({
      check: `${key}: completed authored finding cannot permit clean export or approval request`,
      result: "passed",
      reviewId: incomingReview.reviewId,
      decisionsComplete: true,
      cleanReady: false,
      cleanDownloadStatus: deniedExport.status,
      cleanRequestStatus: deniedRequest.status,
    });
    await persist();
  }
  await clientMcp.close();
  mcpClient = undefined;
  await json(`/api/mcp-tokens/${tokenId}`, "DELETE");
  ledger.temporaryToken = { id: tokenId, maxRole: "editor", matterId: matter.id, revoked: true };
  tokenId = undefined;
  const completion = await json(`/api/tabular/reviews/${prepared.reviewId}/completion`);
  assert.equal(completion.cleanReady, true);
  ledger.reviewCompletion = {
    reviewId: prepared.reviewId,
    inputSnapshotRevision: completion.inputSnapshotRevision,
    reviewInstructions: completion.reviewInstructions,
    decisionsComplete: completion.decisionsComplete,
    cleanReady: completion.cleanReady,
  };
  const exportRequest = await json(`/api/documents/${documentId}/clean-export-requests`, "POST", {
    requestId: randomUUID(),
    reviewId: prepared.reviewId,
  });
  assert.equal(
    exportRequest.approvalRequired,
    false,
    "Unexpected exact export gate in isolated test matter"
  );
  const exported = await download(
    documentId,
    "05-actual-app-clean-export.docx",
    `?output=clean&reviewId=${prepared.reviewId}`
  );
  assert.equal(hash(exported), hash(mixed));
  checks.push({
    check: "source-current V2 review, authored scoped finding, clean-ready and actual clean export",
    result: "passed",
    findingProvenance:
      "scripted agent-authored fixture, not provider output or human legal approval",
  });
  ledger.providerCalls = 0;
  ledger.status =
    "passed local authenticated application Word HTTP boundary; native Word and legal/provider evaluation separate";
  await persist();
  console.log(
    `Local Word HTTP acceptance passed. Sanitized receipts and actual downloads: ${output}`
  );
} catch (error) {
  ledger.status = "failed";
  ledger.failedPhase = phase;
  ledger.failure = error instanceof Error ? error.message : "Unknown acceptance failure";
  await persist();
  console.error(
    `Local Word HTTP acceptance failed at ${phase}; see sanitized receipt in ${output}.`
  );
  process.exitCode = 1;
} finally {
  if (mcpClient) await mcpClient.close().catch(() => {});
  if (tokenId) {
    let revoked = false;
    try {
      await json(`/api/mcp-tokens/${tokenId}`, "DELETE");
      revoked = true;
    } catch {
      /* The receipt must retain an unverified cleanup requirement. */
    }
    ledger.temporaryToken = { id: tokenId, revoked };
    await persist();
  }
}
