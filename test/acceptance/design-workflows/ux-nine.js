// oxlint-disable-next-line no-unused-vars -- Entry point consumed by playwright-cli.
async function uxNine(page) {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  page.setDefaultTimeout(10000);
  const origin = "http://127.0.0.1:4280";
  const keep = () => page.getByRole("dialog", { name: "Keep your unsaved changes?", exact: true });
  const discard = async () => {
    await keep().getByRole("button", { name: "Discard changes", exact: true }).click();
  };
  await page.evaluate(() => window.appFixture?.resetForNavigation());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + "/clients");
  await page.evaluate(() => {
    window.uxStep = "new client";
  });
  await page.getByRole("button", { name: "New client", exact: true }).waitFor();
  const search = page.getByRole("textbox", { name: "Search clients…", exact: true });
  await page
    .getByRole("button", { name: /Northstar Studio/ })
    .first()
    .waitFor();
  await page.evaluate(() => {
    const original = window.fetch;
    window.uxApi = { status: 200, hold: false };
    window.fetch = async (input, init) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        location.href
      );
      if (url.pathname === "/api/clients" && url.searchParams.has("page")) {
        if (window.uxApi.hold)
          return new Promise((resolve) => {
            window.uxRelease = async () => {
              window.uxApi.hold = false;
              resolve(await original(input, init));
              window.uxRelease = null;
            };
          });
        if (window.uxApi.status !== 200)
          return new Response(JSON.stringify({ error: "Fictional collection request failed" }), {
            status: window.uxApi.status,
            headers: { "Content-Type": "application/json" },
          });
      }
      return original(input, init);
    };
  });
  await page.evaluate(() => {
    window.uxStep = "request states";
  });
  await page.evaluate(() => {
    window.uxApi.status = 503;
  });
  await search.fill("Cedar");
  const failed = page.getByRole("alert").filter({ hasText: "Clients could not be refreshed" });
  await failed.waitFor();
  assert(
    !(await page.getByText("No clients yet", { exact: true }).isVisible()),
    "A failed fetch must not look like an empty collection"
  );
  await page.screenshot({
    path: "output/playwright/ux-collection-error.png",
    animations: "disabled",
  });
  await page.evaluate(() => {
    window.uxApi.status = 200;
  });
  await page.getByRole("button", { name: "Retry Clients", exact: true }).click();
  await page
    .getByRole("button", { name: /Cedar Health/ })
    .first()
    .waitFor();
  await page.evaluate(() => {
    window.uxApi.status = 403;
  });
  await search.fill("Acorn");
  await page.getByRole("alert").filter({ hasText: "Clients access unavailable" }).waitFor();
  assert(
    (await page.getByRole("checkbox", { name: "Select row", exact: true }).count()) === 0,
    "Denied results must remove private rows"
  );
  await page.evaluate(() => {
    window.uxApi.status = 200;
  });
  await page.getByRole("button", { name: "Retry Clients", exact: true }).click();
  await page
    .getByRole("button", { name: /Acorn Technologies/ })
    .first()
    .waitFor();
  await page.evaluate(() => {
    window.uxApi.hold = true;
  });
  await search.fill("Northstar");
  await page.waitForFunction(() => typeof window.uxRelease === "function");
  await page.getByRole("status").filter({ hasText: "Updating results" }).waitFor();
  assert(
    (await page.locator('[aria-label="Clients results"] [inert]').count()) === 1,
    "Unconfirmed filter results must pause actions"
  );
  await page.evaluate(() => window.uxRelease());
  await page
    .getByRole("button", { name: /Northstar Studio/ })
    .first()
    .waitFor();
  await search.fill("");
  await page.evaluate(() => {
    window.uxStep = "selection";
  });
  const firstRow = page.getByRole("checkbox", { name: "Select row", exact: true }).first();
  await firstRow.waitFor();
  await firstRow.check();
  const all = page.getByRole("checkbox", { name: "Select all rows on this page", exact: true });
  await page.waitForFunction(
    () =>
      document
        .querySelector('[aria-label="Select all rows on this page"]')
        .getAttribute("aria-checked") === "mixed"
  );
  assert(
    (await all.getAttribute("aria-checked")) === "mixed",
    "Partial selection must be exposed as mixed"
  );
  await all.check();
  await all.uncheck();
  await page.evaluate(() => {
    window.uxStep = "edit draft";
  });
  const opener = page.getByRole("button", { name: /Northstar Studio/ }).first();
  await opener.focus();
  await page.keyboard.press("Enter");
  const edit = page.getByRole("dialog", { name: "Edit client", exact: true });
  await edit.waitFor();
  await edit
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Local client draft retained");
  await page.evaluate(() => window.appFixture.refresh());
  assert(
    (await edit.getByRole("textbox", { name: "Name", exact: true }).inputValue()) ===
      "Local client draft retained",
    "Refresh must not overwrite an edit"
  );
  await edit.getByRole("button", { name: "Save", exact: true }).click();
  await edit.getByRole("alert").filter({ hasText: "Client was not saved" }).waitFor();
  await page.keyboard.press("Escape");
  await keep().waitFor();
  await keep().getByRole("button", { name: "Keep editing", exact: true }).click();
  assert(
    (await edit.getByRole("textbox", { name: "Name", exact: true }).inputValue()) ===
      "Local client draft retained",
    "Keep editing must preserve the input"
  );
  await edit.getByRole("button", { name: "Cancel", exact: true }).click();
  await discard();
  await edit.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "New client", exact: true }).click();
  const nameInput = page.getByRole("textbox", { name: "Name", exact: true });
  await nameInput.fill("temporary");
  await nameInput.fill("");
  await nameInput.blur();
  await page.getByText("Name is required", { exact: true }).waitFor();
  const errorId = (await nameInput.getAttribute("aria-describedby"))
    ?.split(/\s+/)
    .find((id) => id.endsWith("-error"));
  assert(
    errorId && (await page.locator(`[id="${errorId}"]`).textContent()) === "Name is required",
    "Field errors must be programmatically associated"
  );
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("New client draft retained");
  await page.getByRole("link", { name: "Workflows", exact: true }).click();
  await keep().waitFor();
  assert((await keep().count()) === 1, "Route exit must show one combined draft prompt");
  await keep().getByRole("button", { name: "Keep editing", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await discard();
  await page.getByRole("textbox", { name: "Name", exact: true }).waitFor({ state: "hidden" });
  await page.evaluate(() => {
    window.uxStep = "return context";
  });
  await page.getByRole("combobox", { name: "Rows per page", exact: true }).selectOption("25");
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await page.getByText("Page 2 of 3", { exact: true }).waitFor();
  await page.locator('[data-slot="table-container"]').evaluate((el) => {
    el.parentElement.scrollTop = 200;
  });
  await page.getByRole("link", { name: "Workflows", exact: true }).click();
  await page.getByRole("heading", { name: "Workflows", level: 1, exact: true }).waitFor();
  await page.getByRole("link", { name: "Clients", exact: true }).click();
  await page.getByText("Page 2 of 3", { exact: true }).waitFor();
  await page.waitForFunction(
    () => document.querySelector('[data-slot="table-container"]').parentElement.scrollTop > 100
  );
  await page.getByRole("link", { name: "Matters", exact: true }).click();
  const matter = page
    .getByRole("main")
    .getByRole("link", { name: "Commercial services agreement", exact: true });
  await matter.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "Read-only matter destination", exact: true }).waitFor();
  await page.evaluate(() => window.history.back());
  await matter.waitFor();
  await page.waitForFunction(
    () => document.activeElement?.textContent === "Commercial services agreement"
  );
  await page.evaluate(() => {
    window.uxStep = "matter draft";
  });
  await page.getByRole("button", { name: "New matter", exact: true }).click();
  const matterForm = page.getByRole("dialog", { name: "New matter", exact: true });
  await matterForm.getByRole("textbox", { name: "Matter name", exact: true }).fill("Draft matter");
  await matterForm.getByRole("button", { name: "Cancel", exact: true }).click();
  await keep().waitFor();
  await keep().getByRole("button", { name: "Keep editing", exact: true }).click();
  assert(
    (await matterForm.getByRole("textbox", { name: "Matter name", exact: true }).inputValue()) ===
      "Draft matter",
    "Matter draft must survive closing attempts"
  );
  await matterForm.getByRole("button", { name: "Cancel", exact: true }).click();
  await discard();
  await page.getByRole("link", { name: "Workflows", exact: true }).click();
  await page.evaluate(() => {
    window.uxStep = "workflow draft";
  });
  await page.getByRole("button", { name: "New workflow", exact: true }).click();
  const workflow = page.getByRole("dialog", { name: "New workflow", exact: true });
  await workflow.waitFor();
  await workflow.getByRole("textbox").first().fill("Draft workflow retained");
  await page.keyboard.press("Escape");
  await keep().waitFor();
  await keep().getByRole("button", { name: "Keep editing", exact: true }).click();
  assert(
    (await workflow.getByRole("textbox").first().inputValue()) === "Draft workflow retained",
    "Workflow draft must survive Escape"
  );
  await workflow.getByRole("button", { name: "Create workflow", exact: true }).click();
  await workflow.getByRole("alert").filter({ hasText: "Workflow was not saved" }).waitFor();
  await page.screenshot({
    path: "output/playwright/ux-workflow-draft-error.png",
    animations: "disabled",
  });
  await workflow.getByRole("button", { name: "Cancel", exact: true }).click();
  await discard();
  await page.getByRole("link", { name: "Documents", exact: true }).click();
  await page.evaluate(() => {
    window.uxStep = "pending delete";
  });
  await page.getByRole("button", { name: "Upload documents", exact: true }).waitFor();
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = (input, init) => {
      const path = typeof input === "string" ? input : input.url;
      if (init?.method === "DELETE" && path.startsWith("/api/documents/"))
        return new Promise((resolve) => {
          window.uxDeleteRelease = () =>
            resolve(
              new Response(JSON.stringify({ error: "Fictional delete was not confirmed" }), {
                status: 503,
                headers: { "Content-Type": "application/json" },
              })
            );
        });
      return original(input, init);
    };
  });
  await page.getByRole("button", { name: "Row actions", exact: true }).first().click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  const deleting = page.getByRole("dialog", { name: "Delete document?", exact: true });
  await deleting.getByRole("button", { name: "Delete", exact: true }).click();
  await page.waitForFunction(() => typeof window.uxDeleteRelease === "function");
  await page.keyboard.press("Escape");
  assert(await deleting.isVisible(), "Escape must not hide an in-flight deletion");
  assert(
    (await deleting.getByRole("button", { name: "Close", exact: true }).count()) === 0,
    "Pending confirmation must not offer a misleading close"
  );
  await page.evaluate(() => {
    window.pendingNode = document.querySelector("main h1");
    window.history.back();
  });
  const pending = page.getByRole("dialog", { name: "Action in progress", exact: true });
  await pending.waitFor();
  assert(
    await pending.getByRole("button", { name: "Discard changes", exact: true }).isDisabled(),
    "A sent destructive request cannot be discarded as cancelled"
  );
  await pending.getByRole("button", { name: "Keep editing", exact: true }).click();
  await page.evaluate(() => {
    window.pendingBeforeRelease = {
      connected: window.pendingNode.isConnected,
      url: location.href,
      titles: [...document.querySelectorAll("[data-slot=dialog-title]")].map(
        (el) => el.textContent
      ),
    };
  });
  await page.screenshot({
    path: "output/playwright/ux-delete-pending.png",
    animations: "disabled",
  });
  await page.evaluate(() => window.uxDeleteRelease());
  try {
    await deleting
      .getByRole("alert")
      .filter({ hasText: "Fictional delete was not confirmed" })
      .waitFor();
  } catch {
    throw new Error(
      JSON.stringify(
        await page.evaluate(() => ({
          before: window.pendingBeforeRelease,
          after: {
            connected: window.pendingNode.isConnected,
            url: location.href,
            titles: [...document.querySelectorAll("[data-slot=dialog-title]")].map(
              (el) => el.textContent
            ),
          },
        }))
      )
    );
  }
  await deleting.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "Mobile document view must remain contained"
  );
  await page.screenshot({
    path: "output/playwright/ux-documents-mobile.png",
    animations: "disabled",
  });
  return {
    explicitFailureAndDenial: true,
    unconfirmedResultsBlocked: true,
    mixedSelection: true,
    keyboardOpenAndReturnFocus: true,
    draftsSurviveRefreshAndClose: true,
    oneExitPrompt: true,
    paginationAndScrollRestored: true,
    namedWorkflowDialog: true,
    persistentFormErrors: true,
    pendingDeleteCannotDisappear: true,
    pendingRouteExitProtected: true,
    visiblePrimaryLabels: true,
    mobileContained: true,
    scope:
      "Production components with fictional intercepted API outcomes; no live auth, provider, backend deletion or legal-quality claim",
  };
}
