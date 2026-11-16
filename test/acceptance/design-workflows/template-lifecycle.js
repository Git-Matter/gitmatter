// oxlint-disable-next-line no-unused-vars -- Function entry point consumed by playwright-cli.
async function templateLifecycle(page) {
  await page.evaluate(() => {
    window.evidenceChapterEvents = [];
  });
  const title = `Northstar Design Audit ${Date.now()}`;
  const downloadReceipts = [];
  let templateId;
  const fixtureRoot = "test/acceptance/template-library/fixtures";
  const slow = await page.evaluate(() => window.evidenceSlow === true);
  const pause = async (milliseconds = 900) => {
    if (slow) await page.waitForTimeout(milliseconds);
  };
  const chapter = async (text) => {
    await page.evaluate((value) => window.evidenceChapter(value), text);
    await pause(1400);
  };
  const check = (value, message) => {
    if (!value) throw new Error(message);
  };
  const role = async (value) => {
    await page.getByRole("combobox", { name: "Evidence persona", exact: true }).selectOption(value);
    await pause(850);
  };
  const waitClosed = async () => {
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.waitForFunction(() => !window.evidenceSearch().template);
  };
  const open = async () => {
    await page.getByRole("button", { name: new RegExp(`^${title}`) }).click();
    await page.getByRole("heading", { name: title, exact: true }).waitFor();
    check(
      await page.evaluate((id) => window.evidenceSearch().template === id, templateId),
      "The selected template must be represented in controlled route state"
    );
    await page
      .getByRole("region", { name: "Word document preview", exact: true })
      .locator(".docx")
      .first()
      .waitFor();
    await pause(900);
  };
  const close = async () => {
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await pause(350);
  };
  const select = async (label, option) => {
    await page.getByRole("combobox", { name: label, exact: true }).click();
    await page.getByRole("option", { name: option, exact: true }).click();
  };
  const team = async (name, access) => {
    await open();
    await page.getByText("Template team", { exact: true }).click();
    await select("Workspace member", name);
    await select("Access", access);
    await pause(800);
    await page.getByRole("button", { name: "Set access", exact: true }).click();
    await waitClosed();
    await pause(500);
  };
  const submit = async (version) => {
    await open();
    await select("Send to reviewer", "Jordan Lee");
    await page
      .getByRole("textbox", { name: "What should the reviewer check?", exact: true })
      .fill(
        version === 1
          ? "Please check the confidentiality term before publication."
          : "Updated original Word document: please review the five-year term."
      );
    await pause(800);
    await page.getByRole("button", { name: `Send v${version} for review`, exact: true }).click();
    await waitClosed();
  };
  const replace = async (version) => {
    await open();
    await page.getByRole("button", { name: "Create working revision", exact: true }).click();
    await page
      .getByLabel("Replace the Word document", { exact: true })
      .setInputFiles(`${fixtureRoot}/northstar-mutual-nda-v${version}.docx`);
    await page
      .getByRole("textbox", { name: "Reason for this revision", exact: true })
      .fill(
        version === 2
          ? "Changed confidentiality to five years as requested by Jordan."
          : "Proposed seven-year term for the next review; approved file remains current."
      );
    await pause(1100);
    await page.getByRole("button", { name: "Save working revision", exact: true }).click();
    await waitClosed();
  };

  await role("owner");
  await chapter("1 / Start with the original Word document — not reconstructed text");
  await page.getByRole("button", { name: "New template", exact: true }).click();
  await page.getByRole("textbox", { name: "Template name", exact: true }).fill(title);
  await page
    .getByLabel("Original Word document", { exact: true })
    .setInputFiles(`${fixtureRoot}/northstar-mutual-nda-v1.docx`);
  await page
    .getByRole("textbox", { name: "When to use it", exact: true })
    .fill("For reciprocal commercial discussions. Fictional evidence record.");
  await select("Approved access", "Everyone in this workspace, including sales");
  await pause(1800);
  await page.getByRole("button", { name: "Create draft", exact: true }).click();
  await waitClosed();
  templateId = await page.evaluate(async (name) => {
    const data = await (await fetch("/api/templates")).json();
    return data.items.find((item) => (item.draft ?? item.current)?.title === name).id;
  }, title);
  await open();
  await pause(2000);
  await close();

  await chapter("2 / Delegate editing and review — no workspace-admin promotion");
  await team("Sam Rivera", "Editor");
  await team("Jordan Lee", "Reviewer");
  await role("editor");
  await submit(1);
  await role("reviewer");
  await page.getByRole("tab", { name: "Needs review", exact: true }).click();
  await open();
  await pause(1600);
  await page
    .getByRole("textbox", { name: "Decision reason", exact: true })
    .fill("Please use a five-year term, then resubmit the original Word file.");
  await pause(900);
  await page.getByRole("button", { name: "Request changes", exact: true }).click();
  await waitClosed();

  await chapter("3 / Reviewer feedback stays with the next working revision");
  await role("editor");
  await page.getByRole("tab", { name: "Changes requested", exact: true }).click();
  await pause(1600);
  await page.getByRole("tab", { name: "All templates", exact: true }).click();
  await replace(2);
  await submit(2);
  await role("reviewer");
  await open();
  const preview = page.getByRole("region", { name: "Word document preview", exact: true });
  await preview
    .getByText("The confidentiality obligations continue for five years after disclosure.", {
      exact: true,
    })
    .scrollIntoViewIfNeeded();
  await chapter("4 / Review and approve the exact original revision v2");
  await page
    .getByRole("textbox", { name: "Decision reason", exact: true })
    .fill("Reviewed original Word v2 and approved the five-year term.");
  await page
    .getByRole("checkbox", { name: "I reviewed working revision v2 shown here.", exact: true })
    .check();
  await pause(1800);
  await page.getByRole("button", { name: "Approve and publish v2", exact: true }).click();
  await waitClosed();

  await chapter("5 / Sales gets the approved original, with its name and version");
  await role("sales");
  await open();
  await pause(2000);
  check(
    (await page.getByRole("button", { name: "Create working revision", exact: true }).count()) ===
      0,
    "Reader unexpectedly has edit controls"
  );
  check(
    (await page.getByText("Version and decision history", { exact: true }).count()) === 0,
    "Reader unexpectedly sees internal history"
  );
  const downloadPattern = `**/api/templates/${templateId}/download*`;
  await page.route(downloadPattern, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Fictional download temporarily unavailable" }),
    })
  );
  await page.getByRole("button", { name: "Download approved v2", exact: true }).click();
  await page.getByText("Fictional download temporarily unavailable", { exact: true }).waitFor();
  check(
    await page.getByRole("heading", { name: title, exact: true }).isVisible(),
    "Failed download must retain the approved-template context"
  );
  await page.unroute(downloadPattern);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download approved v2", exact: true }).click(),
  ]);
  check(
    download.suggestedFilename() === `${title.replaceAll(" ", "-")}-v2.docx`,
    "Downloaded filename lost template/version identity"
  );
  await download.saveAs("output/playwright/design-workflows/template-approved-v2.docx");
  const receipt = async () =>
    page.evaluate(async (id) => {
      const detail = await (await fetch(`/api/templates/${id}`)).json();
      const response = await fetch(`/api/templates/${id}/download`);
      const bytes = await response.arrayBuffer();
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      return {
        version: detail.current.version,
        revisionId: detail.current.id,
        sourceSha256: detail.current.file.sha256,
        downloadSha256: digest,
        filename: response.headers.get("Content-Disposition"),
        exactHashMatch: digest === detail.current.file.sha256,
        privateDraftHidden: detail.draft === null,
        status: response.status,
      };
    }, templateId);
  downloadReceipts.push(await receipt());
  check(
    downloadReceipts[0].downloadSha256 ===
      "336baaafced68ff7d63aeef19ed6326db88d3251d7b3911fb54f3440c2c74a92",
    "Published download differs from original styled v2 fixture"
  );
  await pause(1300);
  await close();

  await chapter("6 / A new working draft cannot replace the approved download");
  await role("editor");
  await replace(3);
  await submit(3);
  await role("reviewer");
  await open();
  await page.getByRole("tab", { name: "Approved v2", exact: true }).click();
  check(
    (await page.getByRole("button", { name: "Approve and publish v3", exact: true }).count()) === 0,
    "Published view still exposes approval of a different draft"
  );
  await pause(2200);
  await close();
  await role("sales");
  await open();
  check(
    (await page.getByRole("tab", { name: "Working v3", exact: true }).count()) === 0,
    "Reader unexpectedly sees next working revision"
  );
  downloadReceipts.push(await receipt());
  check(
    downloadReceipts[1].downloadSha256 === downloadReceipts[0].downloadSha256,
    "Working v3 changed the approved v2 download"
  );
  await pause(1700);
  await close();

  await chapter("7 / Withdraw retired templates while keeping their history");
  await role("owner");
  await open();
  await page.getByText("Lifecycle actions", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "Reason", exact: true })
    .fill("Retire this fictional evidence template.");
  await page.getByRole("button", { name: "Archive and withdraw", exact: true }).click();
  await pause(1200);
  await page.getByRole("button", { name: "Withdraw template", exact: true }).click();
  await waitClosed();
  await role("sales");
  check(
    (await page.getByRole("button", { name: new RegExp(`^${title}`) }).count()) === 0,
    "Archived template remains listed for reader"
  );
  await chapter(
    "Verified locally: approved originals, delegated review, private drafts, attributable history"
  );
  const result = await page.evaluate(async () => {
    const response = await fetch("/api/templates");
    const list = await response.json();
    return {
      readerVisibleTemplates: list.items.length,
      evidenceTier:
        "Local DB + disk test object adapter + injected personas; not production authentication",
    };
  });
  const archivedResponse = await page.evaluate(
    async (id) => (await fetch(`/api/templates/${id}/download`)).status,
    templateId
  );
  check(archivedResponse === 404, "Archived download remains accessible to reader");
  return {
    passed: true,
    controlledRouteFlow: true,
    templateId,
    title,
    downloadedFilename: download.suggestedFilename(),
    failedDownloadRetainedContext: true,
    downloadReceipts,
    archivedReaderDownloadStatus: archivedResponse,
    chapters: await page.evaluate(() => window.evidenceChapterEvents),
    ...result,
  };
}
