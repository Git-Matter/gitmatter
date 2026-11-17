// oxlint-disable-next-line no-unused-vars -- Function entry point consumed by playwright-cli.
async function reviewStates(page) {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Contract review", exact: true }).click();
  await page.getByRole("tab", { name: "Document", exact: true }).click();
  const workspace = page.getByRole("region", { name: "Contract review workspace", exact: true });
  const completion = page.getByRole("region", { name: "Review completion", exact: true });
  const openProposal = async () => {
    const summary = workspace.getByText("Propose tracked change", { exact: true });
    await summary.waitFor();
    if (!(await summary.evaluate((element) => element.parentElement.open))) await summary.click();
  };
  const choose = async (scenario) => {
    await page.getByRole("combobox", { name: /^Scenario/ }).selectOption(scenario);
    await workspace.waitFor();
  };
  await choose("invalid");
  await workspace.getByRole("button", { name: /^Confidentiality term/ }).click();
  const proposalSummary = workspace.getByText("Propose tracked change", { exact: true });
  if (!(await proposalSummary.evaluate((element) => element.parentElement.open)))
    await proposalSummary.click();
  await workspace.getByText("Citation validation failed.", { exact: false }).waitFor();
  assert(
    await workspace
      .getByRole("button", { name: /Unverified against reviewed source$/ })
      .isDisabled(),
    "Unverified quotation must not pretend to locate a verified source"
  );
  assert(
    await workspace.getByRole("button", { name: "Propose redline", exact: true }).isDisabled(),
    "Invalid citation must block proposal"
  );
  await choose("stale");
  await workspace
    .getByText("This is the source captured when the review started.", { exact: false })
    .waitFor();
  await openProposal();
  assert(
    await workspace.getByRole("button", { name: "Propose redline", exact: true }).isDisabled(),
    "Stale source must block new proposal"
  );
  assert(
    await completion.getByText("Clean export blocked", { exact: true }).isVisible(),
    "Stale source must block clean export"
  );
  await choose("viewer");
  await workspace
    .getByRole("textbox", { name: "Decision rationale", exact: true })
    .waitFor({ state: "hidden" });
  assert(
    (await workspace.getByRole("textbox", { name: "Decision rationale", exact: true }).count()) ===
      0,
    "Reader must not get a decision form"
  );
  assert(
    (await workspace.getByRole("button", { name: "Propose redline", exact: true }).count()) === 0,
    "Reader must not get a proposal action"
  );
  await choose("failed");
  const modelPicker = page.getByRole("button", { name: "Select model", exact: true });
  if (await modelPicker.count()) {
    await modelPicker.click();
    await page
      .getByRole("button", { name: "Claude Sonnet 5 (fixture choice only)", exact: true })
      .click();
  }
  const retry = workspace.getByRole("button", { name: "Retry 1 failed rule", exact: true });
  await retry.waitFor();
  assert(await retry.isDisabled(), "Unknown provider outcome requires acknowledgement");
  await workspace.getByRole("checkbox", { name: /A previous provider outcome is unknown/ }).check();
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (el) => el.textContent === "Retry 1 failed rule" && !el.disabled
    )
  );
  assert(
    await completion.getByText("Decisions remain open", { exact: true }).isVisible(),
    "Failed work must not claim completion"
  );
  const blocked = [];
  for (const [scenario, title] of [
    ["word_incoming", "Incoming Word revisions detected"],
    ["word_limited", "Word source coverage is limited"],
    ["word_unknown", "Word inspection incomplete"],
  ]) {
    await choose(scenario);
    await workspace.getByText(title, { exact: true }).waitFor();
    assert(
      await workspace
        .getByText(
          "Tracked editing, acceptance or rejection of Word changes, and clean export are blocked",
          { exact: false }
        )
        .isVisible(),
      "Unsafe Word coverage must stay expanded and explain the block"
    );
    assert(
      await completion
        .getByText("Word output blocked by source inspection", { exact: true })
        .isVisible(),
      "Unsafe Word must not offer clean export"
    );
    blocked.push(scenario);
  }
  await choose("complete");
  await completion.getByText("Ready for clean export", { exact: true }).waitFor();
  assert(
    await workspace.getByText("No Word revisions detected", { exact: true }).isVisible(),
    "Safe inspection needs a concise status"
  );
  await workspace.getByText("No Word revisions detected", { exact: true }).click();
  assert(
    await workspace.getByText("Inspection scope and version", { exact: true }).isVisible(),
    "Detailed coverage must remain available"
  );
  const counters = await page.locator('[data-testid="synthetic-request-counters"]').textContent();
  assert(counters.includes("execution attempts 0"), "State inspection must not retry a provider");
  return {
    invalidCitationBlocked: true,
    staleProposalAndExportBlocked: true,
    readerControlsAbsent: true,
    unknownRetryAcknowledgement: true,
    unsafeWordCases: blocked,
    safeInspectionProgressive: true,
    executionAttempts: 0,
  };
}
