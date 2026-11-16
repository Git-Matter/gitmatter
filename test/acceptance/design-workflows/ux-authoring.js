// oxlint-disable-next-line no-unused-vars -- Entry point consumed by playwright-cli.
async function uxAuthoring(page) {
  page.setDefaultTimeout(10000);
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const keep = () => page.getByRole("dialog", { name: "Keep your unsaved changes?", exact: true });
  await page.evaluate(() => window.appFixture?.resetForNavigation());
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Better Auth binds fetch during module creation; intercept its fictional metadata at transport level.
  await page.route("**/api/auth/passkey/list-user-passkeys", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]",
    })
  );
  await page.goto("http://127.0.0.1:4280/library");
  await page.getByRole("button", { name: "Clauses", exact: true }).click();
  await page.getByRole("button", { name: "New clause", exact: true }).click();
  const clause = page.getByRole("dialog", { name: "New clause", exact: true });
  await clause.getByRole("textbox", { name: "Title", exact: true }).fill("Draft clause retained");
  await page.keyboard.press("Escape");
  await keep().waitFor();
  await keep().getByRole("button", { name: "Keep editing", exact: true }).click();
  assert(
    (await clause.getByRole("textbox", { name: "Title", exact: true }).inputValue()) ===
      "Draft clause retained",
    "Clause editor must preserve its draft"
  );
  await clause.getByRole("button", { name: "Cancel", exact: true }).click();
  await keep().getByRole("button", { name: "Discard changes", exact: true }).click();
  await clause.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Playbooks", exact: true }).click();
  await page.getByRole("button", { name: "New playbook", exact: true }).click();
  const playbook = page.getByRole("dialog", { name: "New playbook", exact: true });
  await playbook.locator("input#pb-title").fill("Draft playbook retained");
  await page.keyboard.press("Escape");
  await keep().waitFor();
  await keep().getByRole("button", { name: "Keep editing", exact: true }).click();
  assert(
    (await playbook.locator("input#pb-title").inputValue()) === "Draft playbook retained",
    "Playbook editor must preserve its draft"
  );
  await playbook.getByRole("button", { name: "Cancel", exact: true }).click();
  await keep().getByRole("button", { name: "Discard changes", exact: true }).click();
  await page.getByRole("link", { name: "Reviews", exact: true }).click();
  await page.getByRole("button", { name: "New review", exact: true }).click();
  const review = page.getByRole("dialog", { name: "New review", exact: true });
  await review
    .getByRole("textbox", { name: "Review name", exact: true })
    .fill("Draft review retained");
  await page.keyboard.press("Escape");
  await keep().waitFor();
  await keep().getByRole("button", { name: "Keep editing", exact: true }).click();
  assert(
    (await review.getByRole("textbox", { name: "Review name", exact: true }).inputValue()) ===
      "Draft review retained",
    "Review creation must preserve its draft"
  );
  await review.getByRole("button", { name: "Cancel", exact: true }).click();
  await keep().getByRole("button", { name: "Discard changes", exact: true }).click();
  await page.goto("http://127.0.0.1:4280/workflows/assistant/00000040-0000-4000-8000-000000000004");
  const prompt = page.getByRole("textbox", { name: "Workflow prompt", exact: true });
  await prompt.waitFor();
  await page.evaluate(() => {
    window.fixtureWorkflowWrites = 0;
    const original = window.fetch;
    window.fetch = (input, init) => {
      if (
        init?.method === "PATCH" &&
        typeof input === "string" &&
        input.startsWith("/api/workflows/")
      )
        window.fixtureWorkflowWrites++;
      return original(input, init);
    };
  });
  await page.waitForTimeout(1000);
  assert(
    await page.evaluate(() => window.fixtureWorkflowWrites === 0),
    "Opening the workflow must not write changes"
  );
  await prompt.fill("Fictional autosave draft retained after failure");
  await page.getByRole("alert").filter({ hasText: "Workflow changes were not saved" }).waitFor();
  assert(
    (await prompt.textContent()).trim() === "Fictional autosave draft retained after failure",
    "Autosave failure must retain the latest edit"
  );
  await page.getByRole("link", { name: "Documents", exact: true }).click();
  await keep().waitFor();
  await keep().getByRole("button", { name: "Keep editing", exact: true }).click();
  await page.screenshot({
    path: "output/playwright/ux-autosave-recovery.png",
    animations: "disabled",
  });
  await page.evaluate(async () => {
    const path = location.pathname.split("/").pop();
    const current = await fetch("/api/workflows/" + path).then((response) => response.json());
    const original = window.fetch;
    window.fetch = (input, init) => {
      if (
        init?.method === "PATCH" &&
        typeof input === "string" &&
        input.startsWith("/api/workflows/")
      )
        return Promise.resolve(
          new Response(
            JSON.stringify({
              ...current,
              workflow: { ...current.workflow, ...JSON.parse(init.body) },
            }),
            { headers: { "Content-Type": "application/json" } }
          )
        );
      return original(input, init);
    };
  });
  await page.getByRole("button", { name: "Retry workflow save", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: /^Saved$/ })
    .waitFor();
  await page.evaluate(() => {
    const original = window.fetch;
    window.queuedWorkflowWrites = [];
    window.releaseWorkflowWrite = null;
    window.fetch = (input, init) => {
      if (
        init?.method !== "PATCH" ||
        typeof input !== "string" ||
        !input.startsWith("/api/workflows/")
      )
        return original(input, init);
      window.queuedWorkflowWrites.push(JSON.parse(init.body));
      return new Promise((resolve) => {
        window.releaseWorkflowWrite = () => original(input, init).then(resolve);
      });
    };
  });
  await prompt.fill("First queued edit");
  await page.waitForFunction(() => window.queuedWorkflowWrites.length === 1);
  await prompt.fill("Latest queued edit");
  await page.waitForTimeout(1000);
  assert(
    await page.evaluate(() => window.queuedWorkflowWrites.length === 1),
    "Workflow writes must be serialized"
  );
  await page.evaluate(() => window.releaseWorkflowWrite());
  await page.waitForFunction(() => window.queuedWorkflowWrites.length === 2);
  assert(
    (await page
      .getByRole("status")
      .filter({ hasText: /^Saving…$/ })
      .count()) === 1,
    "An older response must not mark a newer edit saved"
  );
  await page.evaluate(() => window.releaseWorkflowWrite());
  await page
    .getByRole("status")
    .filter({ hasText: /^Saved$/ })
    .waitFor();
  assert(
    (await prompt.textContent()).trim() === "Latest queued edit",
    "Latest editor value must survive the older save response"
  );
  assert(
    await page.evaluate(
      () => window.queuedWorkflowWrites[1].steps[0].promptMd.trim() === "Latest queued edit"
    ),
    "The latest payload must be sent after the first write"
  );
  await page.getByRole("link", { name: "Documents", exact: true }).click();
  await page.getByRole("heading", { name: "Documents", exact: true, level: 1 }).waitFor();
  assert((await keep().count()) === 0, "Confirmed autosave must resolve the exit guard");
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  const name = page.locator("#profile-name");
  await name.waitFor();
  await page.getByText("No passkeys added yet.", { exact: true }).waitFor();
  await page.screenshot({
    path: "output/playwright/app-settings-desktop.png",
    animations: "disabled",
  });
  await page.route("**/api/auth/update-user", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Fictional profile save unavailable",
        code: "FIXTURE_FAILURE",
      }),
    })
  );
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/auth/update-user"))
        return Promise.resolve(
          new Response(
            JSON.stringify({
              message: "Fictional profile save unavailable",
              code: "FIXTURE_FAILURE",
            }),
            { status: 503, headers: { "Content-Type": "application/json" } }
          )
        );
      return original(input, init);
    };
  });
  await name.fill("Profile draft retained");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Profile was not saved" }).waitFor();
  assert(
    (await name.inputValue()) === "Profile draft retained",
    "Profile save failure must preserve input"
  );
  await page.screenshot({ path: "output/playwright/ux-profile-error.png", animations: "disabled" });
  await page.getByRole("link", { name: "Documents", exact: true }).click();
  await keep().waitFor();
  assert((await keep().count()) === 1, "Settings and form guards must not compete");
  await keep().getByRole("button", { name: "Keep editing", exact: true }).click();
  assert(
    (await name.inputValue()) === "Profile draft retained",
    "Keep editing must retain the profile draft"
  );
  await page.getByRole("link", { name: "Documents", exact: true }).click();
  await keep().getByRole("button", { name: "Discard changes", exact: true }).click();
  await page.goto("http://127.0.0.1:4280/settings");
  await name.waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "Settings must fit mobile"
  );
  await page.screenshot({
    path: "output/playwright/app-settings-mobile.png",
    animations: "disabled",
  });
  return {
    noWriteOnWorkflowOpen: true,
    serializedWorkflowWrites: true,
    latestEditSurvivesOlderResponse: true,
    clauseDraftProtected: true,
    playbookDraftProtected: true,
    reviewDraftProtected: true,
    workflowAutosaveErrorRetained: true,
    explicitAutosaveRetry: true,
    confirmedSaveResolvesGuard: true,
    persistentProfileError: true,
    oneWorkspaceExitPrompt: true,
    mobileSettingsContained: true,
    scope:
      "Real product components; fictional read-only fixture and explicitly intercepted save outcomes. No live credential changes, provider calls or server write acceptance claim.",
  };
}
