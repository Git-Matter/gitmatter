// oxlint-disable-next-line no-unused-vars -- Function entry point consumed by playwright-cli.
async function firstReview(page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const scenario = page.getByRole("combobox", { name: /^Scenario/ });
  await scenario.selectOption("guide_start");
  await page.getByRole("button", { name: "Guided first review", exact: true }).click();
  const step = (number) =>
    page.locator(`[data-task-step="${number}"] [data-slot="accordion-trigger"]`);
  const openCount = () =>
    page.locator('[data-slot="accordion-trigger"][aria-expanded="true"]').count();
  await page.getByRole("tab", { name: "Application model", exact: true }).waitFor();
  assert((await openCount()) === 1, "A new guide must focus one stage");
  assert(
    (await step(2).getAttribute("aria-expanded")) === "true",
    "The next new-review task is execution choice"
  );
  await page.getByRole("tab", { name: "Application model", exact: true }).click();
  const next = page.getByRole("button", {
    name: "Continue: Capture review instructions",
    exact: true,
  });
  await next.waitFor();
  assert(
    (await step(2).getAttribute("aria-expanded")) === "true",
    "A recommendation change must not collapse the current stage"
  );
  await next.click();
  assert(
    (await step(5).getAttribute("aria-expanded")) === "true",
    "Continue must open the recommended stage"
  );
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute("data-slot") === "accordion-trigger" &&
      document.activeElement.textContent.startsWith("5."),
    null,
    { timeout: 3000 }
  );
  assert(
    await step(5).evaluate((element) => element === document.activeElement),
    "An explicit Continue action must focus the new stage trigger"
  );
  await page.getByRole("button", { name: "Set up review", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Party we represent: unknown or not instructed", exact: true })
    .uncheck();
  const party = page.getByRole("textbox", { name: "Party we represent", exact: true });
  await party.fill("Fictional Recipient Ltd");
  const retainedParty = page.locator(`input[id="${await party.getAttribute("id")}"]`);
  await page
    .getByRole("checkbox", { name: "Business purpose: unknown or not instructed", exact: true })
    .uncheck();
  const purpose = page.getByRole("textbox", { name: "Business purpose", exact: true });
  await purpose.fill("Evaluate a fictional collaboration");
  await page.getByRole("checkbox", { name: /Synthetic mutual NDA\.docx/ }).check();
  const playbook = page.getByRole("combobox", { name: /Approved playbook/ });
  await playbook.selectOption({ index: 1 });
  await step(2).click();
  await party.waitFor({ state: "hidden" });
  assert((await retainedParty.count()) === 1, "Closing must keep the preparation form mounted");
  assert(
    (await retainedParty.inputValue()) === "Fictional Recipient Ltd",
    "Closing a stage must preserve entered instructions"
  );
  await step(5).click();
  await party.waitFor();
  assert(
    (await purpose.inputValue()) === "Evaluate a fictional collaboration",
    "Reopening must preserve the business purpose"
  );
  assert((await playbook.inputValue()) !== "", "Reopening must preserve the selected standard");
  assert((await openCount()) === 1, "Only the selected stage should be expanded");
  // A disclosed stage must be painted at its full content height, not merely aria-expanded.
  await page.waitForFunction(
    () => {
      const panel = document.querySelector('[data-task-step="5"] [data-slot="accordion-content"]');
      return (
        panel &&
        !panel.hidden &&
        panel.getBoundingClientRect().height > 0 &&
        panel.getBoundingClientRect().height >= panel.scrollHeight - 2 &&
        panel.getAnimations().every((animation) => animation.playState !== "running")
      );
    },
    null,
    { timeout: 4000 }
  );
  await page.screenshot({
    animations: "disabled",
    path: "output/playwright/design-workflows/first-review-prepared-desktop.png",
  });
  const prepare = page.getByRole("button", { name: "Prepare review", exact: true });
  await prepare.click();
  await prepare.waitFor({ state: "hidden" });
  const result = await page.evaluate(async () => {
    const status = await fetch(
      "/api/first-review?matterId=10000000-0000-4000-8000-000000000001"
    ).then((response) => response.json());
    return {
      instructionsCaptured: status.review?.instructionsCaptured,
      counters: document.querySelector('[data-testid="synthetic-request-counters"]').textContent,
    };
  });
  assert(
    result.instructionsCaptured === true,
    "Preparation must save a review with captured instructions"
  );
  assert(
    result.counters.includes("execution attempts 0"),
    "Preparation must not execute inference"
  );
  assert(
    result.counters.includes("Actual provider calls: 0"),
    "The fixture must remain provider-free"
  );
  return {
    task: "new review: choose route, inspect other stage, retain input, prepare without execution",
    result,
  };
}
