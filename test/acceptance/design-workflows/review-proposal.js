// oxlint-disable-next-line no-unused-vars -- Function entry point consumed by playwright-cli.
async function reviewProposal(page) {
  const openProposal = async (scope) => {
    const summary = scope.getByText("Propose tracked change", { exact: true });
    if (
      (await summary.count()) &&
      !(await summary.evaluate((element) => element.parentElement.open))
    )
      await summary.click();
  };
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  const results = [];
  for (const decision of ["Accept", "Reject"]) {
    await page.getByRole("combobox", { name: /^Scenario/ }).selectOption("partial");
    await page.getByRole("button", { name: "Contract review", exact: true }).click();
    await page.getByRole("tab", { name: "Document", exact: true }).click();
    const findings = page.getByRole("region", { name: "Findings and decisions", exact: true });
    await findings.getByRole("button", { name: /^Confidentiality term/ }).click();
    await openProposal(findings);
    await findings
      .getByRole("combobox", { name: "Approved clause", exact: true })
      .selectOption({ index: 1 });
    await findings
      .getByRole("combobox", { name: "Original quoted language", exact: true })
      .selectOption({ index: 1 });
    await findings.getByRole("button", { name: "Propose redline", exact: true }).click();
    await findings.getByRole("button", { name: "Redline pending", exact: true }).waitFor();
    await page.getByRole("link", { name: "Resolve tracked changes", exact: true }).click();
    await page.getByRole("heading", { name: "Tracked changes (1 pending)", exact: true }).waitFor();
    await page.getByRole("button", { name: decision, exact: true }).click();
    await page.getByRole("heading", { name: "Tracked changes (0 pending)", exact: true }).waitFor();
    await page.getByRole("button", { name: "Contract review", exact: true }).click();
    await page.getByRole("tab", { name: "Document", exact: true }).click();
    const disposition = decision === "Accept" ? "resolved" : "needs attention";
    await findings
      .getByRole("button", { name: new RegExp(`^Confidentiality term.*${disposition}$`) })
      .waitFor();
    await page
      .getByRole("region", { name: "Review completion", exact: true })
      .getByText("Decisions remain open", { exact: true })
      .waitFor();
    results.push({
      decision,
      exactChangeResolved: true,
      findingDisposition: disposition,
      remainingReviewWorkVisible: true,
    });
  }
  await page.getByRole("button", { name: "Document decisions", exact: true }).click();
  const counters = await page.locator('[data-testid="synthetic-request-counters"]').textContent();
  const find = page.getByRole("textbox", {
    name: "Find (exact text in the document)",
    exact: true,
  });
  const replacement = page.getByRole("textbox", { name: "Replace with", exact: true });
  const reason = page.getByRole("textbox", { name: "Reason (optional)", exact: true });
  await find.fill("Fictional source language");
  await replacement.fill("Fictional replacement language");
  await reason.fill("Fictional negotiation reason");
  await page.getByRole("link", { name: "Documents", exact: true }).click();
  const guard = page.getByRole("dialog", {
    name: "Keep your unfinished tracked change?",
    exact: true,
  });
  await guard.waitFor();
  await guard.getByRole("button", { name: "Keep editing", exact: true }).click();
  assert(
    (await find.inputValue()) === "Fictional source language" &&
      (await replacement.inputValue()) === "Fictional replacement language" &&
      (await reason.inputValue()) === "Fictional negotiation reason",
    "Manual tracked-change input must survive cancelled navigation"
  );
  await page.getByRole("link", { name: "Documents", exact: true }).click();
  await guard.getByRole("button", { name: "Discard changes", exact: true }).click();
  await guard.waitFor({ state: "hidden" });
  await page.goto("http://127.0.0.1:4286/");
  assert(counters.includes("execution attempts 0"), "Human review must not run a model");
  return {
    cases: results,
    manuallyEnteredChangeProtected: true,
    labelledInputs: true,
    executionAttempts: 0,
    scope: "Production interaction with fictional legal state; not real DOCX transformation proof",
  };
}
