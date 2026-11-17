// oxlint-disable-next-line no-unused-vars -- Function entry point consumed by playwright-cli.
async function reviewOutput(page) {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("combobox", { name: /^Scenario/ }).selectOption("complete");
  await page.getByRole("button", { name: "Contract review", exact: true }).click();
  await page.getByRole("tab", { name: "Document", exact: true }).click();
  const completion = page.getByRole("region", { name: "Review completion", exact: true });
  await completion.getByText("Ready for clean export", { exact: true }).waitFor();
  const report = completion.getByRole("link", { name: "Download review report", exact: true });
  assert(
    (await report.getAttribute("href")).endsWith("/report"),
    "Report is separate from Word output"
  );
  assert(
    (
      await completion
        .getByRole("link", { name: "Draft redline", exact: true })
        .getAttribute("href")
    ).includes("output=tracked"),
    "Draft action must request tracked output"
  );
  await completion.getByRole("button", { name: "Prepare clean DOCX", exact: true }).click();
  await completion
    .getByText("Clean export awaits a human owner decision.", { exact: true })
    .waitFor();
  assert(
    (await completion.getByRole("link", { name: "Download clean DOCX", exact: true }).count()) ===
      0,
    "A pending request cannot expose an approved download"
  );
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileStatus = completion.locator("summary").filter({ hasText: "Review status and files" });
  await mobileStatus.waitFor();
  await mobileStatus.click();
  await completion
    .getByText("Clean export awaits a human owner decision.", { exact: true })
    .waitFor();
  assert(
    (await completion.getByRole("button", { name: "Prepare clean DOCX", exact: true }).count()) ===
      0,
    "Resizing must retain the prepared request instead of preparing a duplicate"
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await completion.getByRole("link", { name: "Open export approval queue", exact: true }).click();
  const queue = page.getByRole("region", { name: "Agent activity", exact: true });
  await queue.getByRole("button", { name: /^Clean DOCX export request/ }).click();
  const source = queue.getByRole("link", { name: "Inspect the exact source DOCX", exact: true });
  assert(
    (await source.getAttribute("href")).includes(
      "/versions/10000000-0000-4000-8000-000000000004/download"
    ),
    "Approval must identify the captured source"
  );
  await queue.getByRole("button", { name: "Approve and apply", exact: true }).click();
  const confirmation = page.getByRole("dialog", {
    name: "Apply this exact proposal?",
    exact: true,
  });
  await confirmation.waitFor();
  await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  await confirmation.waitFor({ state: "hidden" });
  assert(
    (await queue
      .getByRole("link", { name: "Download approved clean DOCX", exact: true })
      .count()) === 0,
    "Cancelling confirmation must not authorize an output"
  );
  await queue.getByRole("button", { name: "Approve and apply", exact: true }).click();
  await confirmation.getByRole("button", { name: "Apply proposal", exact: true }).click();
  await confirmation.waitFor({ state: "hidden" });
  await queue.getByRole("combobox", { name: "Show", exact: true }).selectOption("applied");
  await queue.getByRole("button", { name: /^Clean DOCX export request/ }).click();
  const approved = queue.getByRole("link", { name: "Download approved clean DOCX", exact: true });
  await approved.waitFor();
  const href = await approved.getAttribute("href");
  assert(
    href.includes("output=clean") &&
      href.includes("reviewId=") &&
      href.includes("approvalId=10000000-0000-4000-8000-000000000005"),
    "Approved download must carry exact review and approval references"
  );
  const downloadPending = page.waitForEvent("download");
  await approved.click();
  const download = await downloadPending;
  assert(
    download.suggestedFilename() === "fixed-synthetic-source.docx",
    "Only the explicitly fictional fixture file may download"
  );
  await download.saveAs("output/playwright/design-workflows/fixed-synthetic-source.docx");
  await page.setViewportSize({ width: 390, height: 844 });
  await approved.scrollIntoViewIfNeeded();
  await page
    .getByText("Proposal applied and recorded.", { exact: true })
    .waitFor({ state: "hidden" });
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "Approval detail must fit mobile"
  );
  await page.screenshot({
    path: "output/playwright/design-workflows/approved-output-mobile.png",
    animations: "disabled",
  });
  const counters = await page.locator('[data-testid="synthetic-request-counters"]').textContent();
  assert(
    counters.includes("execution attempts 0"),
    "Preparing and approving output must not start a model run"
  );
  return {
    reportAndTrackedDraftDistinct: true,
    pendingDownloadHidden: true,
    exactSourceVisible: true,
    cancelDidNotApprove: true,
    humanConfirmationRequired: true,
    approvedQueueRetrieval: true,
    downloadBoundToReviewAndApproval: true,
    mobileOverflow: false,
    downloadBytes: "Fixed fictional source fixture; not real clean-Word transformation proof",
    executionAttempts: 0,
  };
}
