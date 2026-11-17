// oxlint-disable-next-line no-unused-vars -- Function entry point consumed by playwright-cli.
async function reviewWorkspace(page) {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("combobox", { name: /^Scenario/ }).selectOption("partial");
  await page.getByRole("button", { name: "Contract review", exact: true }).click();
  await page.getByRole("tab", { name: "Document", exact: true }).click();
  const findings = page.getByRole("region", { name: "Findings and decisions", exact: true });
  await findings.getByRole("button", { name: /^Confidentiality term/ }).click();
  const rationale = findings.getByRole("textbox", { name: "Decision rationale", exact: true });
  await rationale.fill("Fictional review rationale retained while comparing findings");
  await findings.getByRole("button", { name: /^Permitted use/ }).click();
  await findings.getByRole("button", { name: /^Confidentiality term/ }).click();
  assert(
    (await rationale.inputValue()) ===
      "Fictional review rationale retained while comparing findings",
    "Comparing findings must not silently discard an entered rationale"
  );
  await findings
    .getByRole("button", { name: /Locate in reviewed source/ })
    .first()
    .click();
  const source = page.locator('[aria-label="Captured source text"]');
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("aria-label") === "Captured source text",
    null,
    { timeout: 3000 }
  );
  assert(
    (await source.locator("mark").textContent()).length > 0,
    "Locate must highlight the captured quotation"
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Findings", exact: true }).click();
  assert(
    (await rationale.inputValue()) ===
      "Fictional review rationale retained while comparing findings",
    "Returning from the source must retain decision input"
  );
  assert(
    (
      await findings
        .getByRole("combobox", { name: "Findings", exact: true })
        .evaluate((element) => element.selectedOptions[0].textContent)
    ).startsWith("Confidentiality term"),
    "Return must retain the selected finding"
  );
  await findings.getByRole("button", { name: "Leave unchanged", exact: true }).click();
  await page.getByText("Saved to the audit history.", { exact: true }).waitFor();
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "Mobile workspace must not overflow the page"
  );
  await page.screenshot({
    path: "output/playwright/design-workflows/review-workspace-mobile.png",
    animations: "disabled",
  });
  const counters = await page.locator('[data-testid="synthetic-request-counters"]').textContent();
  assert(
    counters.includes("execution attempts 0"),
    "Source inspection and human disposition must not execute a model"
  );
  return {
    comparisonDraftRetained: true,
    capturedQuoteHighlighted: true,
    explicitSourceFocus: true,
    mobileReturnPreserved: true,
    humanDispositionSaved: true,
    mobileOverflow: false,
    executionAttempts: 0,
  };
}
