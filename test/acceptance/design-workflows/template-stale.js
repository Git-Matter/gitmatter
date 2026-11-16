// oxlint-disable-next-line no-unused-vars -- Function entry point consumed by playwright-cli.
async function templateStale(page) {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const origin = "http://127.0.0.1:4296";
  const request = (role, path, options = {}) =>
    page.request.fetch(origin + path, {
      ...options,
      headers: { ...options.headers, "X-Evidence-Role": role },
    });
  const json = async (role, path) => {
    const response = await request(role, path);
    assert(response.ok(), `Fixture request failed: ${path} ${response.status()}`);
    return response.json();
  };
  const personas = await json("owner", "/api/evidence/personas");
  const title = `Northstar Stale Review ${Date.now()}`;
  const content = {
    title,
    category: "Commercial",
    body: "",
    guidance: "Fictional concurrent-review acceptance",
    audience: "workspace",
  };
  const upload = async (version, row) => {
    const urls = await page.evaluate(() => window.evidenceFixtures);
    const file = await page.request.get(origin + urls[version]);
    assert(file.ok(), "Tracked fictional DOCX fixture must load");
    const response = await request(
      row ? "editor" : "owner",
      row ? `/api/templates/${row.id}/upload` : "/api/templates/upload",
      {
        method: "POST",
        multipart: {
          file: {
            name: `northstar-v${version}.docx`,
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            buffer: await file.body(),
          },
          content: JSON.stringify(content),
          ...(row
            ? { expectedHead: row.headCommitId, message: "Fictional concurrent working revision" }
            : {}),
        },
      }
    );
    assert(response.ok(), `Fictional upload failed: ${response.status()} ${await response.text()}`);
    return row ? row.id : (await response.json()).id;
  };
  const act = async (role, id, action, extra = {}) => {
    const row = await json(role, `/api/templates/${id}`);
    const response = await request(role, `/api/templates/${id}/actions`, {
      method: "POST",
      data: {
        action,
        expectedHead: row.headCommitId,
        revisionId: row.draft?.id,
        message: `Fictional ${action} acceptance`,
        ...extra,
      },
    });
    assert(response.ok(), `Fictional action ${action} failed: ${response.status()}`);
  };
  const id = await upload(1);
  await act("owner", id, "set_member", { userId: personas.editor.id, role: "editor" });
  await act("owner", id, "set_member", { userId: personas.reviewer.id, role: "reviewer" });
  await act("editor", id, "submit", { reviewerId: personas.reviewer.id });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("combobox", { name: "Evidence persona", exact: true })
    .selectOption("reviewer");
  const search = page.getByRole("textbox", { name: "Search templates", exact: true });
  await search.fill(title);
  await page.getByRole("tab", { name: "Needs review", exact: true }).click();
  const opener = page.getByRole("button", { name: new RegExp(`^${title}`) });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: title, exact: true });
  const preview = dialog.getByRole("region", { name: "Word document preview", exact: true });
  await preview
    .getByText("The confidentiality obligations continue for three years after disclosure.", {
      exact: true,
    })
    .waitFor();
  const note = dialog.getByRole("textbox", { name: "Decision reason", exact: true });
  await note.fill("Fictional decision note for the original v1 snapshot");
  await dialog
    .getByRole("checkbox", { name: "I reviewed working revision v1 shown here.", exact: true })
    .check();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  const guard = page.getByRole("dialog", { name: "Keep your template review input?", exact: true });
  await guard.waitFor();
  await guard.getByRole("button", { name: "Keep editing", exact: true }).click();
  assert(
    (await note.inputValue()) === "Fictional decision note for the original v1 snapshot",
    "Keep must retain the review note"
  );
  await page.evaluate(() => {
    void window.evidenceNavigateAway();
  });
  await guard.waitFor();
  await guard.getByRole("button", { name: "Keep editing", exact: true }).click();
  assert(
    await page.evaluate((expected) => window.evidenceSearch().template === expected, id),
    "Cancelling controlled route exit must retain the selected template"
  );
  assert(
    (await note.inputValue()) === "Fictional decision note for the original v1 snapshot",
    "Cancelled route exit must retain the review note"
  );
  const old = await json("reviewer", `/api/templates/${id}`);
  await upload(2, await json("editor", `/api/templates/${id}`));
  await act("editor", id, "submit", { reviewerId: personas.reviewer.id });
  const staleAttempt = await request("reviewer", `/api/templates/${id}/actions`, {
    method: "POST",
    data: {
      expectedHead: old.headCommitId,
      revisionId: old.draft.id,
      action: "publish",
      message: "Fictional stale approval attempt",
    },
  });
  assert(staleAttempt.status() === 409, "Core must reject an approval against the earlier head");
  await page.evaluate(() => window.evidenceQueryRefresh());
  await dialog
    .getByText("This template changed while you were reviewing it", { exact: true })
    .waitFor();
  assert(
    (await note.inputValue()) === "Fictional decision note for the original v1 snapshot",
    "Background refresh must preserve the note"
  );
  assert(
    (await note.getAttribute("readonly")) !== null,
    "Earlier note must stay copyable without pretending it can apply to the new revision"
  );
  await preview
    .getByText("The confidentiality obligations continue for three years after disclosure.", {
      exact: true,
    })
    .waitFor();
  assert(
    (await dialog.getByRole("button", { name: /^Approve and publish/ }).count()) === 0,
    "Stale snapshot must not offer approval"
  );
  await dialog.getByRole("button", { name: "Reload revision", exact: true }).click();
  await guard.waitFor();
  await guard.getByRole("button", { name: "Keep editing", exact: true }).click();
  assert(
    (await note.inputValue()) === "Fictional decision note for the original v1 snapshot",
    "Cancelling reload must retain the old snapshot and note"
  );
  await dialog.getByRole("button", { name: "Reload revision", exact: true }).click();
  await guard.getByRole("button", { name: "Discard changes", exact: true }).click();
  await guard.waitFor({ state: "hidden" });
  await preview
    .getByText("The confidentiality obligations continue for five years after disclosure.", {
      exact: true,
    })
    .waitFor();
  assert((await note.inputValue()) === "", "Deliberate reload must not apply the old note to v2");
  assert(
    !(await dialog
      .getByRole("checkbox", { name: "I reviewed working revision v2 shown here.", exact: true })
      .isChecked()),
    "New revision needs a fresh human review confirmation"
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await note.fill("Fictional v2 mobile review note");
  await note.scrollIntoViewIfNeeded();
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "Template review must fit the mobile page"
  );
  assert(
    await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    "Template dialog contents must not overflow horizontally"
  );
  const close = dialog.getByRole("button", { name: "Close", exact: true });
  const closeBounds = await close.boundingBox();
  assert(
    closeBounds && closeBounds.y >= 0 && closeBounds.y + closeBounds.height <= 844,
    "Mobile review keeps its close control available while the note is in view"
  );
  assert(
    await note.evaluate((el) => {
      const bounds = el.getBoundingClientRect();
      return (
        document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2) === el
      );
    }),
    "The visible note must not be covered by the pinned context header"
  );
  await dialog.screenshot({
    path: "output/playwright/design-workflows/template-review-mobile.png",
    animations: "disabled",
  });
  await close.click();
  await guard.waitFor();
  await guard.getByRole("button", { name: "Discard changes", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert((await search.inputValue()) === title, "Closing detail must retain the list search");
  assert(
    (await page
      .getByRole("tab", { name: "Needs review", exact: true })
      .getAttribute("aria-selected")) === "true",
    "Closing detail must retain the list filter"
  );
  await page.waitForFunction(() =>
    document.activeElement?.textContent?.includes("Northstar Stale Review")
  );
  assert(
    await opener.evaluate((el) => el === document.activeElement),
    "Closing review must return focus to its originating row"
  );
  await opener.click();
  await note.fill("Fictional note retained during a template refresh outage");
  await dialog
    .getByRole("checkbox", { name: "I reviewed working revision v2 shown here.", exact: true })
    .check();
  const detailPattern = `**/api/templates/${id}`;
  await page.route(detailPattern, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Fictional temporary template refresh failure" }),
    })
  );
  await page.evaluate(() => window.evidenceQueryRefresh());
  await dialog.getByText("Template could not be refreshed", { exact: true }).waitFor();
  assert(
    (await note.inputValue()) === "Fictional note retained during a template refresh outage",
    "Transient failure must retain the mounted note"
  );
  assert(
    (await note.getAttribute("readonly")) !== null,
    "Cached failed-refresh state cannot authorize decisions"
  );
  assert(
    (await dialog.getByRole("button", { name: /^Approve and publish/ }).count()) === 0,
    "Outage must block approval from cached state"
  );
  await page.unroute(detailPattern);
  await dialog.getByRole("button", { name: "Retry template refresh", exact: true }).click();
  await dialog
    .getByText("Template could not be refreshed", { exact: true })
    .waitFor({ state: "hidden" });
  assert(
    (await note.inputValue()) === "Fictional note retained during a template refresh outage",
    "Recovery must preserve the note"
  );
  const actionPattern = `**/api/templates/${id}/actions`;
  let release;
  const responseGate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route(actionPattern, async (route) => {
    const response = await route.fetch();
    await responseGate;
    await route.fulfill({ response });
  });
  try {
    await dialog.getByRole("button", { name: "Request changes", exact: true }).click();
    await dialog.getByRole("button", { name: "Recording change request…", exact: true }).waitFor();
    assert(
      await dialog.getByRole("button", { name: "Close", exact: true }).isDisabled(),
      "An in-flight audit mutation cannot be discarded as though it were cancelled"
    );
    assert(
      await note.isDisabled(),
      "An in-flight decision must not accept edits that its response could silently discard"
    );
    await page.keyboard.press("Escape");
    assert(await dialog.isVisible(), "Escape must retain the pending decision context");
  } finally {
    release();
  }
  await dialog.waitFor({ state: "hidden" });
  await page.unroute(actionPattern);
  await page.getByRole("tab", { name: "Changes requested", exact: true }).click();
  await opener.click();
  await preview
    .getByText("The confidentiality obligations continue for five years after disclosure.", {
      exact: true,
    })
    .waitFor();
  await act("owner", id, "remove_member", { userId: personas.reviewer.id });
  await page.evaluate(() => window.evidenceQueryRefresh());
  const unavailable = page.getByRole("dialog", { name: "Template unavailable", exact: true });
  await unavailable.waitFor();
  assert(
    (await page.getByRole("region", { name: "Word document preview", exact: true }).count()) === 0,
    "An authoritative denial must remove the cached private revision"
  );
  assert(
    (await page.getByRole("textbox", { name: "Decision reason", exact: true }).count()) === 0,
    "Denied access must not leave the private note form on screen"
  );
  await unavailable.getByRole("button", { name: "Close", exact: true }).click();
  await unavailable.waitFor({ state: "hidden" });
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("aria-label") === "Search templates"
  );
  const denied = await request("sales", `/api/templates/${id}/actions`, {
    method: "POST",
    data: {
      expectedHead: (await json("owner", `/api/templates/${id}`)).headCommitId,
      action: "archive",
      message: "Fictional denied reader action",
    },
  });
  assert(
    [403, 404].includes(denied.status()),
    "Reader must not gain mutation authority from the UI route"
  );
  await act("owner", id, "archive");
  await act("owner", id, "restore");
  const restored = await json("owner", `/api/templates/${id}`);
  assert(
    restored.status === "draft",
    "Restore must require fresh review rather than inventing approval"
  );
  await act("owner", id, "archive");
  return {
    id,
    frozenSourcePreserved: true,
    noteRetainedAndCopyable: true,
    staleApprovalStatus: staleAttempt.status(),
    reloadKeepAndDiscard: true,
    freshV2Confirmation: true,
    mobileOverflow: false,
    mobileContextAndClosePinned: true,
    searchAndFilterRetained: true,
    openerFocusReturned: true,
    controlledRouteExitProtected: true,
    transientRefreshRetainedAndBlocked: true,
    refreshRecoveryPreserved: true,
    pendingMutationProtected: true,
    pendingActionLabelTruthful: true,
    revokedPrivateViewCleared: true,
    removedRowFocusFallback: true,
    deniedReaderStatus: denied.status(),
    restoreRequiresApproval: true,
    scope:
      "Current UI/Hono/core + local Postgres and disk adapter; injected fictional personas, not production authentication",
  };
}
