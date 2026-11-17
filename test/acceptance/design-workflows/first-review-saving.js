// oxlint-disable-next-line no-unused-vars -- Function entry point consumed by playwright-cli.
async function firstReviewSaving(page) {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  await page.getByRole("combobox", { name: /^Scenario/ }).selectOption("guide_slow_prepare");
  await page.getByRole("button", { name: "Guided first review", exact: true }).click();
  await page.getByRole("tab", { name: "Application model", exact: true }).click();
  await page
    .getByRole("button", { name: "Continue: Capture review instructions", exact: true })
    .click();
  await page.getByRole("button", { name: "Set up review", exact: true }).click();
  await page.getByRole("checkbox", { name: /Synthetic mutual NDA\.docx/ }).check();
  await page.getByRole("combobox", { name: /Approved playbook/ }).selectOption({ index: 1 });
  await page.getByRole("button", { name: "Prepare review", exact: true }).click();
  await page.getByRole("button", { name: "Preparing…", exact: true }).waitFor();
  assert(
    await page.getByRole("button", { name: "Close setup", exact: true }).isDisabled(),
    "Saving must prevent local close"
  );
  await page.getByRole("link", { name: "Return to matter", exact: true }).click();
  const saving = page.getByRole("dialog", { name: "Saving your changes", exact: true });
  await saving.waitFor();
  assert(
    await saving.getByRole("button", { name: "Discard changes", exact: true }).isDisabled(),
    "A pending save cannot be labelled as discarded/cancelled"
  );
  await page.getByRole("list", { name: "First-review steps" }).waitFor({ state: "hidden" });
  await saving.waitFor({ state: "hidden" });
  const facts = await page.evaluate(async () =>
    fetch("/api/first-review?matterId=10000000-0000-4000-8000-000000000001").then((response) =>
      response.json()
    )
  );
  const counters = await page.locator('[data-testid="synthetic-request-counters"]').textContent();
  assert(
    facts.review?.instructionsCaptured === true,
    "A confirmed save must navigate normally despite an earlier blocked exit"
  );
  assert(counters.includes("execution attempts 0"), "Preparation is not inference execution");
  return {
    pendingCloseDisabled: true,
    pendingExitGuarded: true,
    confirmedSaveNavigated: true,
    executionAttempts: 0,
  };
}
