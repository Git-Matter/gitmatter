// oxlint-disable-next-line no-unused-vars -- Function entry point consumed by playwright-cli.
async function firstReviewExit(page) {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("combobox", { name: /^Scenario/ }).selectOption("guide_start");
  await page.getByRole("button", { name: "Guided first review", exact: true }).click();
  await page.getByRole("tab", { name: "Application model", exact: true }).click();
  await page
    .getByRole("button", { name: "Continue: Capture review instructions", exact: true })
    .click();
  await page.getByRole("button", { name: "Set up review", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Party we represent: unknown or not instructed", exact: true })
    .uncheck();
  const party = page.getByRole("textbox", { name: "Party we represent", exact: true });
  await party.fill("Fictional unsaved instructions");
  const confirm = page.getByRole("dialog", { name: "Keep your review instructions?", exact: true });
  await page.getByRole("button", { name: "Close setup", exact: true }).click();
  await confirm.waitFor();
  await confirm.getByRole("button", { name: "Keep editing", exact: true }).click();
  await confirm.waitFor({ state: "hidden" });
  assert(
    (await party.inputValue()) === "Fictional unsaved instructions",
    "Keep editing must retain local instructions"
  );
  await page.getByRole("link", { name: "Return to matter", exact: true }).click();
  await confirm.waitFor();
  await confirm.getByRole("button", { name: "Keep editing", exact: true }).click();
  await confirm.waitFor({ state: "hidden" });
  assert(
    (await party.inputValue()) === "Fictional unsaved instructions",
    "Cancelling route exit must retain inputs and the guide"
  );
  await page.getByRole("button", { name: "Close setup", exact: true }).click();
  await confirm.waitFor();
  await confirm.getByRole("button", { name: "Discard changes", exact: true }).click();
  await page
    .getByRole("region", { name: "Review contract setup", exact: true })
    .waitFor({ state: "hidden" });
  const opener = page.getByRole("button", { name: "Set up review", exact: true });
  await page.waitForFunction(() => document.activeElement?.textContent === "Set up review", null, {
    timeout: 3000,
  });
  assert(
    await opener.evaluate((element) => element === document.activeElement),
    "Explicit discard must return focus to the setup opener"
  );
  await opener.click();
  assert(
    await page
      .getByRole("checkbox", { name: "Party we represent: unknown or not instructed", exact: true })
      .isChecked(),
    "A deliberate discard must start with fresh inputs"
  );
  const counters = await page.locator('[data-testid="synthetic-request-counters"]').textContent();
  assert(
    counters.includes("execution attempts 0"),
    "Discard and navigation must not run inference"
  );
  return {
    localKeep: true,
    routeKeep: true,
    deliberateDiscard: true,
    returnFocus: true,
    freshReopen: true,
    executionAttempts: 0,
  };
}
