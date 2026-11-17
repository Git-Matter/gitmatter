// oxlint-disable-next-line no-unused-vars -- Function entry point consumed by playwright-cli.
async function templateStale(page) {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const origin = "http://127.0.0.1:4280";
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
  const upload = async (version, row, overrides = {}) => {
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
          content: JSON.stringify({ ...content, ...overrides }),
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
  const successfulCapabilityNarrowing = [];
  for (const variant of [
    { role: "reviewer", fileBacked: true, cause: "membership removal" },
    { role: "owner", fileBacked: false, cause: "ownership transfer" },
  ]) {
    successfulCapabilityNarrowing.push(await checkPublishedCapabilityNarrowing(variant));
  }
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
    successfulCapabilityNarrowing,
    scope:
      "Current UI/Hono/core + local Postgres and disk adapter; injected fictional personas, not production authentication",
  };

  async function checkPublishedCapabilityNarrowing(variant) {
    const caseTitle = `Northstar Published Revocation ${variant.role} ${Date.now()}`;
    const publishedBody = "Fictional approved ownership language.";
    const privateBody = "PRIVATE working ownership language that must disappear.";
    const privateGuidance = "PRIVATE drafting guidance that must disappear.";
    let caseId;
    if (variant.fileBacked) caseId = await upload(1, undefined, { title: caseTitle });
    else {
      const created = await request("owner", "/api/templates", {
        method: "POST",
        data: { ...content, title: caseTitle, body: publishedBody },
      });
      assert(created.ok(), "Fictional text template must create successfully");
      caseId = (await created.json()).id;
    }
    await act("owner", caseId, "set_member", { userId: personas.editor.id, role: "editor" });
    await act("owner", caseId, "set_member", { userId: personas.reviewer.id, role: "reviewer" });
    await act("owner", caseId, "submit", { reviewerId: personas.reviewer.id });
    await act("reviewer", caseId, "publish");
    const published = await json("owner", `/api/templates/${caseId}`);
    const originalDownload = await request("sales", `/api/templates/${caseId}/download`);
    assert(originalDownload.ok(), "The published original must be readable before revocation");
    const approvedBytes = await originalDownload.body();
    if (variant.fileBacked)
      await upload(2, await json("editor", `/api/templates/${caseId}`), {
        title: caseTitle,
        guidance: privateGuidance,
      });
    else {
      const saved = await request("owner", `/api/templates/${caseId}`, {
        method: "PUT",
        data: {
          expectedHead: published.headCommitId,
          content: { ...content, title: caseTitle, body: privateBody, guidance: privateGuidance },
          message: "Fictional private working revision",
        },
      });
      assert(saved.ok(), "The fictional private text revision must save");
    }
    if (variant.role === "reviewer")
      await act("editor", caseId, "submit", { reviewerId: personas.reviewer.id });
    const privateRevision = (await json(variant.role, `/api/templates/${caseId}`)).draft;
    await page
      .getByRole("combobox", { name: "Evidence persona", exact: true })
      .selectOption(variant.role);
    await page.getByRole("tab", { name: "All templates", exact: true }).click();
    await search.fill(caseTitle);
    await page.getByRole("button", { name: new RegExp(`^${caseTitle}`) }).click();
    const privateDialog = page.getByRole("dialog", { name: caseTitle, exact: true });
    await privateDialog.waitFor();
    const privateText = variant.fileBacked
      ? "The confidentiality obligations continue for five years after disclosure."
      : privateBody;
    await privateDialog.getByText(privateText, { exact: true }).waitFor();
    const localNote = `Fictional local ${variant.role} note retained after access changes`;
    await privateDialog
      .getByRole("textbox", {
        name: variant.role === "reviewer" ? "Decision reason" : "What should the reviewer check?",
        exact: true,
      })
      .fill(localNote);
    if (variant.role === "reviewer")
      await privateDialog
        .getByRole("checkbox", { name: "I reviewed working revision v2 shown here.", exact: true })
        .check();
    if (variant.role === "reviewer")
      await act("owner", caseId, "remove_member", { userId: personas.reviewer.id });
    else await act("owner", caseId, "assign", { ownerId: personas.editor.id });
    const redactedResponse = page.waitForResponse(
      (response) =>
        response.url() === `${origin}/api/templates/${caseId}` &&
        response.request().method() === "GET" &&
        response.status() === 200
    );
    await page.evaluate(() => window.evidenceQueryRefresh());
    const redacted = await (await redactedResponse).json();
    assert(
      !redacted.canManage &&
        redacted.draft === null &&
        redacted.current?.id === published.current.id,
      "Revocation must be a successful reader response, not a 403/404 substitute"
    );
    const narrowed = page.getByRole("dialog", {
      name: "Your template access changed",
      exact: true,
    });
    await narrowed.waitFor();
    assert(
      (await narrowed.getByText(privateText, { exact: true }).count()) === 0,
      "A successful redaction must remove the frozen private source"
    );
    assert(
      (await narrowed.getByText(privateGuidance, { exact: true }).count()) === 0,
      "Private drafting guidance must disappear"
    );
    assert(
      (await narrowed
        .getByRole("region", { name: "Word document preview", exact: true })
        .count()) === 0,
      "The previously loaded private DOCX renderer must unmount"
    );
    for (const label of ["Template team", "Version and decision history", "Lifecycle actions"])
      assert(
        (await narrowed.getByText(label, { exact: true }).count()) === 0,
        `${label} must not survive narrowed access`
      );
    assert(
      (await narrowed.getByRole("tab").count()) === 0,
      "A reader must not compare or switch to a private working source"
    );
    assert(
      (await narrowed.getByRole("checkbox").count()) === 0,
      "Old review acknowledgement must disappear"
    );
    assert(
      (await narrowed
        .getByRole("button", {
          name: /Approve|Request changes|working|Set access|Assign owner|Withdraw/,
        })
        .count()) === 0,
      "No private decision, edit, file or team action may remain"
    );
    const retained = narrowed.getByRole("textbox", {
      name: "Your unsaved review note",
      exact: true,
    });
    assert(
      (await retained.inputValue()) === localNote &&
        (await retained.getAttribute("readonly")) !== null,
      "Only locally authored input stays separately copyable"
    );
    if (variant.fileBacked)
      await narrowed
        .getByRole("region", { name: "Approved Word document preview", exact: true })
        .getByText("The confidentiality obligations continue for three years after disclosure.", {
          exact: true,
        })
        .waitFor();
    else await narrowed.getByText(publishedBody, { exact: true }).waitFor();
    const browserDownload = page.waitForEvent("download");
    await narrowed.getByRole("button", { name: "Download approved v1", exact: true }).click();
    assert(
      (await browserDownload).suggestedFilename().endsWith("-v1.docx"),
      "Remaining download must identify the approved version"
    );
    const readerDownload = await request(
      variant.role,
      `/api/templates/${caseId}/download?revisionId=${published.current.id}`
    );
    assert(
      readerDownload.ok() &&
        readerDownload.headers()["x-template-revision"] === published.current.id,
      "Remaining reader download must identify the approved revision"
    );
    if (variant.fileBacked)
      assert(
        approvedBytes.equals(await readerDownload.body()),
        "The approved original bytes must not change"
      );
    else
      assert(redacted.current.body === publishedBody, "The approved text source must not change");
    const deniedPrivate = await request(
      variant.role,
      `/api/templates/${caseId}/download?revisionId=${privateRevision.id}`
    );
    assert(
      [403, 404].includes(deniedPrivate.status()),
      "The narrowed user must not download the private revision directly"
    );
    await narrowed.getByRole("button", { name: "Close", exact: true }).click();
    await guard.waitFor();
    await guard.getByRole("button", { name: "Keep editing", exact: true }).click();
    assert(
      (await retained.inputValue()) === localNote,
      "Cancelling close must retain the local note without restoring private data"
    );
    await narrowed.getByRole("button", { name: "Close", exact: true }).click();
    await guard.getByRole("button", { name: "Discard changes", exact: true }).click();
    await narrowed.waitFor({ state: "hidden" });
    assert(
      (await json("sales", `/api/templates/${caseId}`)).current.id === published.current.id,
      "Local access recovery must not approve or replace the current file"
    );
    await act(variant.role === "owner" ? "editor" : "owner", caseId, "archive");
    return {
      cause: variant.cause,
      fileBacked: variant.fileBacked,
      detailStatus: 200,
      privateViewAndControlsRemoved: true,
      localNoteRetainedSeparately: true,
      approvedVersionUnchanged: true,
      originalByteEqualityChecked: variant.fileBacked,
      privateDownloadStatus: deniedPrivate.status(),
    };
  }
}
