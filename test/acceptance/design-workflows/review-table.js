// oxlint-disable-next-line no-unused-vars -- Function entry point consumed by playwright-cli.
async function reviewTable(page) {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("combobox", { name: /^Scenario/ }).selectOption("partial");
  await page.getByRole("button", { name: "Contract review", exact: true }).click();
  await page.getByRole("tab", { name: "Table", exact: true }).click();
  const table = page.getByRole("region", { name: "Review table", exact: true });
  await table.waitFor();
  assert(
    !(await page
      .getByRole("region", { name: "Contract review workspace", exact: true })
      .isVisible()),
    "Existing findings must not replace the default table"
  );
  assert(
    await table.evaluate((element) => getComputedStyle(element).borderRadius === "0px"),
    "The review grid must not clip data inside card corners"
  );
  const term = table.getByRole("button", { name: /^Five-year term/ });
  const purpose = table.getByRole("button", { name: /^Purpose-limited use/ });
  await term.click();
  const inspector = page.getByRole("complementary", { name: "Confidentiality term", exact: true });
  await inspector.waitFor();
  assert(await purpose.isEnabled(), "The desktop inspector must leave the table interactive");
  const rationale = inspector.getByRole("textbox", { name: "Decision rationale", exact: true });
  await rationale.fill("Fictional table decision retained across views");
  const proposal = inspector.getByText("Propose tracked change", { exact: true });
  await proposal.click();
  const clause = inspector.getByRole("combobox", { name: "Approved clause", exact: true });
  await clause.selectOption({ index: 1 });
  const clauseValue = await clause.inputValue();
  await purpose.click();
  await term.click();
  assert(
    (await rationale.inputValue()) === "Fictional table decision retained across views",
    "Changing cells must retain the rationale"
  );
  await inspector
    .getByRole("button", { name: /Open source$/ })
    .first()
    .click();
  const source = page.getByRole("dialog", { name: "Synthetic mutual NDA.docx", exact: true });
  await source.waitFor();
  await page.keyboard.press("Escape");
  await source.waitFor({ state: "hidden" });
  assert(await inspector.isVisible(), "Closing the source must retain the selected cell");
  await page.getByRole("tab", { name: "Document", exact: true }).click();
  const workbench = page.getByRole("region", { name: "Findings and decisions", exact: true });
  await workbench.waitFor();
  assert(
    (await workbench
      .getByRole("textbox", { name: "Decision rationale", exact: true })
      .inputValue()) === "Fictional table decision retained across views",
    "Document view must use the same draft store"
  );
  const workbenchProposal = workbench.getByText("Propose tracked change", { exact: true });
  if (!(await workbenchProposal.evaluate((element) => element.parentElement.open)))
    await workbenchProposal.click();
  assert(
    (await workbench
      .getByRole("combobox", { name: "Approved clause", exact: true })
      .inputValue()) === clauseValue,
    "Proposal selections must survive representation changes"
  );
  await page.getByRole("tab", { name: "Table", exact: true }).click();
  await inspector.waitFor();
  await rationale.focus();
  await page.keyboard.press("Escape");
  await inspector.waitFor({ state: "hidden" });
  assert(
    await term.evaluate((element) => element === document.activeElement),
    "Escape must return focus to the selected cell"
  );
  await term.click();
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = page.getByRole("dialog", { name: "Confidentiality term", exact: true });
  await mobile.waitFor();
  assert(
    (await mobile
      .getByRole("textbox", { name: "Decision rationale", exact: true })
      .inputValue()) === "Fictional table decision retained across views",
    "Responsive inspector changes must retain the draft"
  );
  await page.keyboard.press("Escape");
  await mobile.waitFor({ state: "hidden" });
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "Mobile matrix scrolling must stay inside its container"
  );
  const columns = table.getByLabel("Table columns", { exact: true });
  await columns.evaluate((element) => {
    element.scrollLeft = 0;
  });
  await table.getByRole("button", { name: "Next columns", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Table columns"]').scrollLeft > 0
  );
  const afterNext = await columns.evaluate((element) => element.scrollLeft);
  await table.getByRole("button", { name: "Previous columns", exact: true }).click();
  await page.waitForFunction(
    (previous) => document.querySelector('[aria-label="Table columns"]').scrollLeft < previous,
    afterNext
  );
  await term.click();
  await mobile.getByRole("textbox", { name: "Decision rationale", exact: true }).fill("");
  const mobileProposal = mobile.getByText("Propose tracked change", { exact: true });
  if (!(await mobileProposal.evaluate((element) => element.parentElement.open)))
    await mobileProposal.click();
  await mobile.getByRole("combobox", { name: "Approved clause", exact: true }).selectOption("");
  await page.keyboard.press("Escape");
  const counters = await page.locator('[data-testid="synthetic-request-counters"]').textContent();
  assert(
    counters.includes("execution attempts 0"),
    "Scanning and changing views must not start inference"
  );
  return {
    tableDefault: true,
    nonmodalInspection: true,
    sharedRationaleAndProposal: true,
    sourceRoundTrip: true,
    escapeFocus: true,
    responsiveDraftRetention: true,
    containedMobileGrid: true,
    executionAttempts: 0,
  };
}
