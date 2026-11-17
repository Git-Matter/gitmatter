// oxlint-disable-next-line no-unused-vars -- Function entry point consumed by playwright-cli.
async function firstReviewStates(page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const evidence = [];
  const cases = [
    { scenario: "guide_no_storage", step: 1 },
    { scenario: "guide_no_provider", step: 2, chooseApplication: true },
    { scenario: "guide_no_standard", step: 3, chooseApplication: true },
    { scenario: "guide_no_source", step: 4, chooseApplication: true },
    { scenario: "partial", step: 7 },
    { scenario: "failed", step: 6 },
    { scenario: "viewer", step: 6 },
    { scenario: "complete", step: 8 },
    { scenario: "stale", step: 5, chooseApplication: true },
  ];
  for (const item of cases) {
    await page.getByRole("combobox", { name: /^Scenario/ }).selectOption(item.scenario);
    await page.getByRole("button", { name: "Guided first review", exact: true }).click();
    await page.getByRole("list", { name: "First-review steps" }).waitFor();
    if (item.chooseApplication) {
      if (
        (await page
          .locator('[data-task-step="2"] [data-slot="accordion-trigger"]')
          .getAttribute("aria-expanded")) !== "true"
      )
        await page.locator('[data-task-step="2"] [data-slot="accordion-trigger"]').click();
      await page.getByRole("tab", { name: "Application model", exact: true }).click();
    }
    await page.waitForFunction(
      (expected) => {
        const status = [...document.querySelectorAll('[role="status"]')].find((element) =>
          element.textContent.startsWith("Suggested next task:")
        );
        const stepTitle = document.querySelector(
          `[data-task-step="${expected}"] [data-slot="accordion-trigger"]`
        )?.textContent;
        return (
          status &&
          stepTitle &&
          stepTitle.includes(status.textContent.replace("Suggested next task:", "").trim())
        );
      },
      item.step,
      { timeout: 3000 }
    );
    const current = page.locator(`[data-task-step="${item.step}"] [data-slot="accordion-trigger"]`);
    if ((await current.getAttribute("aria-expanded")) !== "true") {
      const continuation = page.getByRole("button", { name: /^Continue:/ });
      await continuation.click();
    }
    assert(
      (await current.getAttribute("aria-expanded")) === "true",
      `${item.scenario}: suggested stage must open`
    );
    assert(
      (await page.locator('[data-slot="accordion-trigger"][aria-expanded="true"]').count()) === 1,
      `${item.scenario}: only one stage is expanded`
    );
    if (item.scenario === "viewer") {
      assert(
        await page.getByText("This matter is read only for you", { exact: true }).isVisible(),
        "Reader needs an explicit role explanation"
      );
      assert(
        (await page.getByRole("button", { name: "Set up review", exact: true }).count()) === 0,
        "Reader cannot prepare work"
      );
    }
    if (item.scenario === "stale")
      assert(
        await page
          .getByText("The review uses an earlier source version", { exact: true })
          .isVisible(),
        "Stale source warning must remain outside collapsed stages"
      );
    const counters = await page.locator('[data-testid="synthetic-request-counters"]').textContent();
    assert(
      counters.includes("execution attempts 0"),
      `${item.scenario}: inspection must not run inference`
    );
    evidence.push({
      scenario: item.scenario,
      suggestedStage: item.step,
      expanded: 1,
      executionAttempts: 0,
    });
  }
  await page.getByRole("combobox", { name: /^Scenario/ }).selectOption("guide_error");
  await page.getByRole("button", { name: "Guided first review", exact: true }).click();
  await page.getByText("Review progress could not be loaded", { exact: true }).waitFor();
  assert(
    (await page.getByRole("list", { name: "First-review steps" }).count()) === 0,
    "Unavailable facts must not render fictional progress"
  );
  await page.getByRole("button", { name: "Retry loading", exact: true }).click();
  await page.getByText("Review progress could not be loaded", { exact: true }).waitFor();
  evidence.push({
    scenario: "guide_error",
    error: "persistent and retryable",
    noInventedProgress: true,
  });

  await page.getByRole("combobox", { name: /^Scenario/ }).selectOption("guide_start");
  await page.getByRole("button", { name: "Guided first review", exact: true }).click();
  const matterChoice = page.getByRole("combobox", { name: "Matter for this review", exact: true });
  await matterChoice.selectOption("");
  await page.getByRole("list", { name: "First-review steps" }).waitFor({ state: "hidden" });
  await page
    .getByText(
      "Choose a matter to see its approved standards, documents and saved review progress.",
      { exact: true }
    )
    .waitFor();
  assert(
    await page
      .getByText(
        "Choose a matter to see its approved standards, documents and saved review progress.",
        { exact: true }
      )
      .isVisible(),
    "No-matter state must provide orientation rather than invented progress"
  );
  await matterChoice.selectOption("10000000-0000-4000-8000-000000000001");
  await page.getByRole("tab", { name: "Application model", exact: true }).waitFor();
  evidence.push({ scenario: "choose-matter", noInventedProgress: true, returnToMatter: true });
  const first = page.locator('[data-task-step="1"] [data-slot="accordion-trigger"]');
  await first.waitFor();
  await first.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("link", { name: "Review data and privacy settings", exact: true }).waitFor();
  await page.keyboard.press("Tab");
  assert(
    await page
      .getByRole("link", { name: "Review data and privacy settings", exact: true })
      .evaluate((element) => element === document.activeElement),
    "Tab must enter the open task rather than hidden content"
  );
  await first.focus();
  await page.keyboard.press("Space");
  assert(
    (await first.getAttribute("aria-expanded")) === "false",
    "Space must close the native task trigger"
  );
  await page.keyboard.press("Tab");
  assert(
    await page
      .locator('[data-task-step="2"] [data-slot="accordion-trigger"]')
      .evaluate((element) => element === document.activeElement),
    "Collapsed content must not enter the tab order"
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-task-step="2"] [data-slot="accordion-trigger"]').click();
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "Mobile guide must not overflow the page"
  );
  // A disclosed stage must be painted at its full content height, not merely aria-expanded.
  await page.waitForFunction(
    () => {
      const panel = document.querySelector('[data-task-step="2"] [data-slot="accordion-content"]');
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
  await page.screenshot({ path: "output/playwright/design-workflows/first-review-mobile.png" });
  evidence.push({
    scenario: "keyboard-and-mobile",
    enterSpace: true,
    tabOrder: true,
    viewport: "390x844",
    overflow: false,
  });
  return evidence;
}
