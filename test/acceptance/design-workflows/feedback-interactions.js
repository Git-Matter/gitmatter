// oxlint-disable-next-line no-unused-vars -- Entry point consumed by playwright-cli.
async function feedbackInteractions(page) {
  page.setDefaultTimeout(10000);
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  await page.evaluate(() => window.appFixture?.resetForNavigation());
  await page.setViewportSize({ width: 1440, height: 1000 });
  let saveAccepted = false;
  let profileRequests = 0;
  await page.route("**/api/auth/**", (route) => {
    const path = route.request().url();
    if (path.includes("/passkey/list-user-passkeys"))
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    if (path.includes("/update-user")) {
      profileRequests++;
      return route.fulfill({
        status: saveAccepted ? 200 : 503,
        contentType: "application/json",
        body: JSON.stringify(
          saveAccepted
            ? {
                user: {
                  id: "demo-reviewer",
                  name: "Alex Reviewer",
                  email: "reviewer@example.invalid",
                },
              }
            : { message: "Fictional profile save failed" }
        ),
      });
    }
    return route.abort();
  });
  await page.goto("http://127.0.0.1:4280/settings");
  const name = page.locator("#profile-name");
  await name.waitFor();
  await page.getByText("No passkeys added yet.", { exact: true }).waitFor();
  assert(
    await page.getByRole("button", { name: "Save", exact: true }).isDisabled(),
    "Unchanged profile has no save to send"
  );
  await page.getByText("Edit your name to enable Save.", { exact: true }).waitFor();
  assert(
    (await name.getAttribute("aria-describedby")) === "profile-name-hint",
    "Profile guidance must be associated with its input"
  );
  assert(
    (await page.locator("#password-requirements").textContent()).includes("at least 8 characters"),
    "Password requirements must be visible before typing"
  );
  assert(
    (await page.locator("#new-password").getAttribute("aria-describedby")) ===
      "password-requirements",
    "Password guidance must be associated with the input"
  );
  await page.screenshot({
    path: "output/playwright/feedback-guidance-desktop.png",
    animations: "disabled",
  });
  await name.fill("Alex Reviewer");
  const save = page.getByRole("button", { name: "Save", exact: true });
  await save.hover();
  const boxBefore = await save.boundingBox();
  await page.mouse.down();
  await page.waitForTimeout(200);
  const pressed = await save.evaluate((element) => ({
    filter: getComputedStyle(element).filter,
    active: element.matches(":active"),
  }));
  assert(
    pressed.active && pressed.filter.includes("0.95"),
    "Enabled buttons need subtle pressed feedback"
  );
  const boxAfter = await save.boundingBox();
  assert(
    JSON.stringify(boxBefore) === JSON.stringify(boxAfter),
    "Press feedback must not shift the button"
  );
  await page.mouse.up();
  await page.getByRole("alert").filter({ hasText: "Profile was not saved" }).waitFor();
  assert(profileRequests === 1, "A press must send one request");
  assert((await name.inputValue()) === "Alex Reviewer", "Failure must retain the input");
  assert(
    (await page.getByRole("status").filter({ hasText: "Profile updated" }).count()) === 0,
    "Failure cannot create a success receipt"
  );
  saveAccepted = true;
  await save.click();
  const receipt = page.getByRole("status").filter({ hasText: "Profile updated" });
  await receipt.waitFor();
  assert(
    (await receipt.textContent()).includes("Last successful action · Settings"),
    "Success must identify its originating section"
  );
  assert(
    (await receipt.getAttribute("aria-live")) === "polite",
    "Success must be announced without moving focus"
  );
  assert(
    (await receipt.getAttribute("aria-atomic")) === "true",
    "The result must be announced with its context"
  );
  assert(
    !(await page
      .getByRole("button", { name: "Dismiss action result", exact: true })
      .evaluate((element) => element === document.activeElement)),
    "A success receipt must not steal focus"
  );
  await page.waitForTimeout(6000);
  assert(await receipt.isVisible(), "Success must outlive the old temporary toast");
  await page.screenshot({
    path: "output/playwright/feedback-success-desktop.png",
    animations: "disabled",
  });
  await page.getByRole("link", { name: "Documents", exact: true }).click();
  await page.getByRole("heading", { name: "Documents", exact: true }).waitFor();
  assert(await receipt.isVisible(), "Confirmed feedback must survive route navigation");
  await page.getByRole("button", { name: "Dismiss action result", exact: true }).click();
  assert((await receipt.count()) === 0, "Dismissal clears the receipt");
  assert(
    await page
      .getByRole("heading", { name: "Documents", exact: true })
      .evaluate((element) => element === document.activeElement),
    "Dismissing feedback must return focus to the current page"
  );
  await page.getByRole("link", { name: "Clients", exact: true }).click();
  await page.getByRole("button", { name: "New client", exact: true }).click();
  await page.locator("#client-create-hint").waitFor();
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = (input, init) =>
      init?.method === "POST" && input === "/api/clients"
        ? Promise.resolve(
            new Response(
              JSON.stringify({ id: "fictional-created-client", name: "Fictional client" }),
              { headers: { "Content-Type": "application/json" } }
            )
          )
        : original(input, init);
  });
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Fictional client");
  await page.getByRole("button", { name: "Create client", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Client created" }).waitFor();
  await page.screenshot({
    path: "output/playwright/feedback-client-created.png",
    animations: "disabled",
  });
  await page.getByRole("link", { name: "Workflows", exact: true }).click();
  await page.getByRole("button", { name: "New workflow", exact: true }).click();
  await page.locator("#workflow-name-hint").waitFor();
  assert(
    (await page
      .getByRole("textbox", { name: "Workflow name", exact: true })
      .getAttribute("aria-describedby")) === "workflow-name-hint",
    "Workflow guidance must be associated with its input"
  );
  await page.keyboard.press("Escape");
  await page.goto("http://127.0.0.1:4280/workflows/assistant/00000040-0000-4000-8000-000000000004");
  const prompt = page.getByRole("textbox", { name: "Workflow prompt", exact: true });
  await prompt.waitFor();
  await page.evaluate(async () => {
    const id = location.pathname.split("/").pop();
    const current = await fetch("/api/workflows/" + id).then((response) => response.json());
    const original = window.fetch;
    window.fetch = (input, init) =>
      init?.method === "PATCH" && input === "/api/workflows/" + id
        ? Promise.resolve(
            new Response(
              JSON.stringify({ workflow: { ...current.workflow, ...JSON.parse(init.body) } }),
              { headers: { "Content-Type": "application/json" } }
            )
          )
        : original(input, init);
  });
  await prompt.fill("Fictional confirmed workflow edit");
  await page
    .getByRole("status")
    .filter({ hasText: /^Saved$/ })
    .waitFor();
  await page.waitForTimeout(3000);
  await page
    .getByRole("status")
    .filter({ hasText: /^Saved$/ })
    .waitFor();
  await page.screenshot({
    path: "output/playwright/feedback-workflow-saved.png",
    animations: "disabled",
  });
  await page.goto("http://127.0.0.1:4280/settings");
  await name.waitFor();
  await name.fill("Alex Reviewer");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Profile updated" }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "Guidance and results must fit mobile"
  );
  await page.screenshot({
    path: "output/playwright/feedback-success-mobile.png",
    animations: "disabled",
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const transition = await page
    .getByRole("button", { name: "Dismiss action result", exact: true })
    .evaluate((element) => getComputedStyle(element).transitionProperty);
  assert(transition === "none", "Pressed feedback must respect reduced motion");
  await page.getByRole("button", { name: "Dismiss action result", exact: true }).click();
  await page.screenshot({
    path: "output/playwright/feedback-guidance-mobile.png",
    animations: "disabled",
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.reload();
  await name.waitFor();
  assert(
    (await page.getByRole("button", { name: "Dismiss action result", exact: true }).count()) === 0,
    "Receipts must not be stored across a workspace reload"
  );
  return {
    associatedGuidance: true,
    pressedWithoutLayoutShift: true,
    noSuccessOnFailure: true,
    retainedFailedInput: true,
    persistentConfirmedSuccess: true,
    successSurvivesNavigation: true,
    dismissalReturnsFocus: true,
    successAfterCreate: true,
    persistentAutosaveStatus: true,
    mobileContained: true,
    reducedMotionRespected: true,
    noDurableReceiptStorage: true,
    captures: 6,
    scope:
      "Production UI components with fictional identity and intercepted save responses. No live authentication, credentials, provider calls, legal decisions or server mutation proof.",
  };
}
