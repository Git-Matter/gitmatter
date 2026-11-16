// oxlint-disable-next-line no-unused-vars -- Function entry point consumed by playwright-cli.
async function firstReviewRefresh(page) {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  await page.getByRole("combobox", { name: /^Scenario/ }).selectOption("guide_start");
  await page.getByRole("button", { name: "Guided first review", exact: true }).click();
  await page.getByRole("tab", { name: "Application model", exact: true }).click();
  await page
    .getByRole("button", { name: "Continue: Capture review instructions", exact: true })
    .click();
  await page.getByRole("button", { name: "Set up review", exact: true }).click();
  assert(
    (await page.getByRole("button", { name: "Set up review", exact: true }).count()) === 0,
    "Do not display a redundant opener while setup is visible"
  );
  await page
    .getByRole("checkbox", { name: "Party we represent: unknown or not instructed", exact: true })
    .uncheck();
  const party = page.getByRole("textbox", { name: "Party we represent", exact: true });
  await party.fill("Fictional retained client context");
  await page.getByRole("checkbox", { name: /Synthetic mutual NDA\.docx/ }).check();
  await page.getByRole("combobox", { name: /Approved playbook/ }).selectOption({ index: 1 });
  const prepare = page.getByRole("button", { name: "Prepare review", exact: true });
  await page.getByRole("button", { name: "Interrupt progress refresh", exact: true }).click();
  await page.getByText("Progress could not be refreshed", { exact: true }).waitFor();
  assert(
    (await party.inputValue()) === "Fictional retained client context",
    "A transient refresh must not unmount entered instructions"
  );
  assert(await prepare.isDisabled(), "Cached progress must not authorize new preparation");
  await page.getByRole("button", { name: "Restore progress refresh", exact: true }).click();
  await page
    .getByText("Progress could not be refreshed", { exact: true })
    .waitFor({ state: "hidden" });
  assert(
    (await party.inputValue()) === "Fictional retained client context",
    "Recovery must preserve entered instructions"
  );
  await page.waitForFunction(() => {
    const buttons = [...document.querySelectorAll("button")];
    return buttons.some((button) => button.textContent === "Prepare review" && !button.disabled);
  });
  await page.getByRole("button", { name: "Revoke fixture access", exact: true }).click();
  await page.getByText("Review progress could not be loaded", { exact: true }).waitFor();
  assert(
    (await page.getByRole("textbox", { name: "Party we represent", exact: true }).count()) === 0,
    "An authoritative denial must not expose cached private work"
  );
  const counters = await page.locator('[data-testid="synthetic-request-counters"]').textContent();
  assert(counters.includes("execution attempts 0"), "Refresh handling must not execute inference");
  return {
    transientRetained: true,
    stalePreparationBlocked: true,
    recoveryRetained: true,
    accessDenialCleared: true,
    redundantOpenerRemoved: true,
    executionAttempts: 0,
  };
}
