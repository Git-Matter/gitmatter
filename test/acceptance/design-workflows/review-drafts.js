// oxlint-disable-next-line no-unused-vars -- Function entry point consumed by playwright-cli.
async function reviewDrafts(page) {
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
  await page.getByRole("combobox", { name: /^Scenario/ }).selectOption("review_error");
  await page.getByRole("button", { name: "Contract review", exact: true }).click();
  await page.getByRole("tab", { name: "Document", exact: true }).click();
  const findings = page.getByRole("region", { name: "Findings and decisions", exact: true });
  const term = findings.getByRole("button", { name: /^Confidentiality term/ });
  const purpose = findings.getByRole("button", { name: /^Permitted use/ });
  await term.click();
  await openProposal(findings);
  const rationale = findings.getByRole("textbox", { name: "Decision rationale", exact: true });
  await rationale.fill("Fictional unsaved judgment");
  const clause = findings.getByRole("combobox", { name: "Approved clause", exact: true });
  const quote = findings.getByRole("combobox", { name: "Original quoted language", exact: true });
  await clause.selectOption({ index: 1 });
  await quote.selectOption({ index: 1 });
  const selected = { clause: await clause.inputValue(), quote: await quote.inputValue() };
  await findings.getByRole("button", { name: "Leave unchanged", exact: true }).click();
  await findings
    .getByRole("alert")
    .filter({ hasText: "Fictional audit save unavailable" })
    .waitFor();
  assert(
    (await rationale.inputValue()) === "Fictional unsaved judgment",
    "Rejected save must retain the rationale"
  );
  await page.evaluate(() => {
    window.reviewDraftRequests = [];
    const fixtureFetch = window.fetch;
    window.fetch = (input, init) => {
      if (typeof input === "string" && input.endsWith("/redline"))
        window.reviewDraftRequests.push(JSON.parse(init.body));
      return fixtureFetch(input, init);
    };
  });
  await findings.getByRole("button", { name: "Propose redline", exact: true }).click();
  await findings
    .getByRole("button", { name: "Propose redline", exact: true })
    .waitFor({ state: "visible" });
  await purpose.click();
  await term.click();
  await openProposal(findings);
  assert(
    (await clause.inputValue()) === selected.clause &&
      (await quote.inputValue()) === selected.quote,
    "Comparison must retain proposal selections after rejection"
  );
  await findings.getByRole("button", { name: "Propose redline", exact: true }).click();
  await page.waitForFunction(() => window.reviewDraftRequests?.length === 2);
  assert(
    await page.evaluate(
      () =>
        window.reviewDraftRequests[0].requestId === window.reviewDraftRequests[1].requestId &&
        !!window.reviewDraftRequests[0].requestId
    ),
    "Unedited retry must retain the same request identity across comparison"
  );
  const dirtyUnload = await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  assert(dirtyUnload, "Unsaved review input needs unload protection");
  const exit = page.getByRole("link", { name: "Reviews", exact: true });
  await exit.click();
  const keep = page.getByRole("dialog", { name: "Keep your unfinished review work?", exact: true });
  await keep.waitFor();
  await keep.getByRole("button", { name: "Keep editing", exact: true }).click();
  assert(
    (await rationale.inputValue()) === "Fictional unsaved judgment",
    "Cancelled navigation must retain review input"
  );
  await page.getByRole("button", { name: "Refresh finding revision", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Decision rationale"]')?.value === ""
  );
  await openProposal(findings);
  assert(
    (await clause.inputValue()) === "" && (await quote.inputValue()) === "",
    "A new finding revision must not inherit the old proposal draft"
  );
  const earlier = findings.getByRole("textbox", {
    name: "Earlier decision rationale",
    exact: true,
  });
  assert(
    (await earlier.inputValue()) === "Fictional unsaved judgment",
    "Earlier unsaved input must remain visible for comparison with the new finding"
  );
  assert(
    (await earlier.getAttribute("readonly")) !== null,
    "Earlier input must not masquerade as a current decision"
  );
  await earlier.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "output/playwright/design-workflows/review-draft-recovery.png",
    animations: "disabled",
  });
  await exit.click();
  await keep.waitFor();
  await keep.getByRole("button", { name: "Discard changes", exact: true }).click();
  await keep.waitFor({ state: "hidden" });
  await page.goto("http://127.0.0.1:4286/");
  await page.getByRole("combobox", { name: /^Scenario/ }).selectOption("review_slow");
  await page.getByRole("button", { name: "Contract review", exact: true }).click();
  await page.getByRole("tab", { name: "Document", exact: true }).click();
  await term.click();
  await openProposal(findings);
  await rationale.fill("Fictional judgment awaiting audit save");
  await findings.getByRole("button", { name: "Leave unchanged", exact: true }).click();
  await purpose.click();
  await term.click();
  await openProposal(findings);
  assert(
    await rationale.isDisabled(),
    "Switching back must not permit a duplicate pending decision"
  );
  await exit.click();
  const saving = page.getByRole("dialog", { name: "Saving your changes", exact: true });
  await saving.waitFor();
  assert(
    await saving.getByRole("button", { name: "Discard changes", exact: true }).isDisabled(),
    "Pending audit save cannot be discarded as though it were cancelled"
  );
  await saving.getByRole("button", { name: "Keep editing", exact: true }).click();
  await findings
    .locator("p")
    .filter({ hasText: "Fictional judgment awaiting audit save" })
    .waitFor();
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Decision rationale"]')?.value === ""
  );
  assert(
    (await rationale.inputValue()) === "",
    "Confirmed decision clears only the saved rationale draft"
  );
  const cleanUnload = await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  assert(!cleanUnload, "Confirmed save releases unload protection");
  return {
    failedSaveRetained: true,
    proposalSelectionsRetained: true,
    retryIdentityStable: true,
    routeKeepAndDiscard: true,
    revisedFindingFresh: true,
    earlierInputRecoverable: true,
    pendingSaveProtectedAcrossComparison: true,
    confirmedSaveCleared: true,
    unloadLifecycle: true,
  };
}
