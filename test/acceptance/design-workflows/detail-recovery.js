// oxlint-disable-next-line no-unused-vars -- Function entry point consumed by playwright-cli.
async function detailRecovery(page) {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const base = "http://127.0.0.1:4280/";
  const reset = async () => {
    // Only explicit fictional scenario resets suppress the native unload prompt.
    await page.evaluate(() => {
      window.addEventListener("beforeunload", (event) => event.stopImmediatePropagation(), {
        capture: true,
        once: true,
      });
    });
    await page.goto(base);
  };
  const reviewPath = "/api/tabular/reviews/10000000-0000-4000-8000-000000000002";
  const documentPath = "/api/documents/10000000-0000-4000-8000-000000000003";
  const installFailures = async () => {
    await page.evaluate(() => {
      window.detailFailures = {};
      window.detailWrites = 0;
      const fixtureFetch = window.fetch;
      window.fetch = (input, init) => {
        const path = new URL(typeof input === "string" ? input : input.url, location.origin)
          .pathname;
        const method = init?.method ?? "GET";
        if (method !== "GET" && !path.endsWith("/opened")) window.detailWrites += 1;
        const status = window.detailFailures[path];
        return status && method === "GET"
          ? Promise.resolve(
              new Response(JSON.stringify({ error: "Fictional detail access unavailable" }), {
                status,
                headers: { "Content-Type": "application/json" },
              })
            )
          : fixtureFetch(input, init);
      };
    });
  };
  const fail = (path, status) =>
    page.evaluate(
      ([path, status]) => {
        window.detailFailures[path] = status;
      },
      [path, status]
    );
  const refresh = () =>
    page.getByRole("button", { name: "Refresh current details", exact: true }).click();
  const notice = (title) => page.getByRole("alert").filter({ hasText: title });
  const cannotClick = async (control) => {
    try {
      await control.click({ timeout: 500 });
      return false;
    } catch {
      return true;
    }
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await reset();
  await page.getByRole("button", { name: "Contract review", exact: true }).waitFor();
  await installFailures();
  await fail(reviewPath, 503);
  await page.getByRole("combobox", { name: /^Scenario/ }).selectOption("complete");
  await page.getByRole("combobox", { name: /^Scenario/ }).selectOption("partial");
  await page.getByRole("button", { name: "Contract review", exact: true }).click();
  await notice("Review unavailable").waitFor();
  await fail(reviewPath, null);
  await page.getByRole("button", { name: "Retry review", exact: true }).click();
  await page.getByRole("heading", { name: "Synthetic NDA review", exact: true }).waitFor();
  await page.getByRole("tab", { name: "Document", exact: true }).click();
  const findings = page.getByRole("region", { name: "Findings and decisions", exact: true });
  await findings.getByRole("button", { name: /^Confidentiality term/ }).click();
  const rationale = findings.getByRole("textbox", { name: "Decision rationale", exact: true });
  await rationale.fill("Fictional draft retained during a detail outage");
  await page.waitForTimeout(5500);
  assert(
    await rationale.evaluate((element) => element === document.activeElement),
    "Routine permission polling interrupted drafting"
  );

  await fail(`${reviewPath}/completion`, 503);
  await refresh();
  await notice("Review permissions and output could not be refreshed").waitFor();
  assert(
    (await page.locator('[aria-label="Decision rationale"]').inputValue()) ===
      "Fictional draft retained during a detail outage",
    "Completion outage lost local rationale"
  );
  assert(
    await cannotClick(findings.getByRole("button", { name: "Leave unchanged", exact: true })),
    "Stale decision actions remain interactive"
  );
  await fail(`${reviewPath}/completion`, null);
  await page
    .getByRole("button", { name: "Retry review permissions and output", exact: true })
    .click();
  await rationale.waitFor();
  assert(
    (await rationale.inputValue()) === "Fictional draft retained during a detail outage",
    "Completion recovery lost rationale"
  );

  await fail(reviewPath, 503);
  await refresh();
  await notice("Review could not be refreshed").waitFor();
  assert(
    await cannotClick(page.getByRole("button", { name: "Run", exact: true })),
    "Stale review permits inference"
  );
  assert(
    (await page.locator('[aria-label="Decision rationale"]').inputValue()) ===
      "Fictional draft retained during a detail outage",
    "Review outage lost local rationale"
  );
  await fail(reviewPath, 403);
  await page.getByRole("button", { name: "Retry review", exact: true }).click();
  await notice("Review unavailable").waitFor();
  assert(
    !(await page
      .locator("main")
      .textContent()
      .then((text) => text.includes("Fictional draft retained during a detail outage"))),
    "Denied review still exposes private draft content"
  );
  assert(
    (await page.getByRole("region", { name: "Contract review workspace", exact: true }).count()) ===
      0,
    "Denied review remains mounted"
  );
  await fail(reviewPath, null);
  await page.getByRole("button", { name: "Retry review", exact: true }).click();
  await rationale.waitFor();
  assert(
    (await rationale.inputValue()) === "Fictional draft retained during a detail outage",
    "Authorized retry lost unfinished rationale"
  );
  assert(
    (await page.evaluate(() => window.detailWrites)) === 0,
    "Recovery sent an unexpected mutation"
  );
  await rationale.fill("");

  await reset();
  await page.getByRole("button", { name: "Document decisions", exact: true }).waitFor();
  await installFailures();
  await fail(documentPath, 404);
  await page.getByRole("button", { name: "Document decisions", exact: true }).click();
  await notice("Document unavailable").waitFor();
  await fail(documentPath, null);
  await page.getByRole("button", { name: "Retry document", exact: true }).click();
  const find = page.getByRole("textbox", {
    name: "Find (exact text in the document)",
    exact: true,
  });
  await find.fill("Fictional unfinished source selection");
  const findId = await find.getAttribute("id");
  await fail(documentPath, 503);
  await refresh();
  await notice("Document could not be refreshed").waitFor();
  assert(
    (await page.locator(`[id="${findId}"]`).inputValue()) ===
      "Fictional unfinished source selection",
    "Document outage lost input"
  );
  assert(
    await cannotClick(page.getByRole("button", { name: "Propose edit", exact: true })),
    "Document outage left mutation interactive"
  );
  await fail(documentPath, 403);
  await page.getByRole("button", { name: "Retry document", exact: true }).click();
  await notice("Document unavailable").waitFor();
  assert(
    (await page.locator(`[id="${findId}"]`).count()) === 0,
    "Denied document exposes private input"
  );
  await fail(documentPath, null);
  await page.getByRole("button", { name: "Retry document", exact: true }).click();
  await find.waitFor();
  assert(
    (await find.inputValue()) === "Fictional unfinished source selection",
    "Authorized document retry lost input"
  );
  assert(
    (await page.evaluate(() => window.detailWrites)) === 0,
    "Document recovery sent a mutation"
  );
  await find.fill("");

  await reset();
  await page.getByRole("button", { name: "Finding inspector", exact: true }).waitFor();
  await installFailures();
  await page.getByRole("button", { name: "Finding inspector", exact: true }).click();
  await page.getByRole("button", { name: "Inspect first finding", exact: true }).click();
  const finding = page.getByRole("dialog", { name: "Permitted use", exact: true });
  await finding.getByRole("button", { name: /Open source$/ }).click();
  const drawer = page.getByRole("dialog", { name: "Synthetic mutual NDA.docx", exact: true });
  await drawer.waitFor();
  await fail(documentPath, 403);
  await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent === "Refresh current details")
      .click()
  );
  const unavailableDrawer = page.getByRole("dialog", { name: "Document", exact: true });
  await unavailableDrawer.getByRole("alert").filter({ hasText: "Document unavailable" }).waitFor();
  assert(
    !(await unavailableDrawer
      .textContent()
      .then((text) => text.includes("Synthetic mutual NDA.docx"))),
    "Denied drawer retains private identity"
  );
  await unavailableDrawer.getByRole("button", { name: "Close", exact: true }).click();
  await finding.waitFor();
  await page.keyboard.press("Escape");
  assert((await page.evaluate(() => window.detailWrites)) === 0, "Drawer recovery sent a mutation");
  await reset();
  return {
    initialErrorsRecover: true,
    staleCompletionPausesDecisions: true,
    backgroundPollingPreservesFocus: true,
    transientDraftsRetained: true,
    deniedContentHidden: true,
    authorizedRetryRetainsDraft: true,
    deniedDrawerCloses: true,
    mutations: 0,
  };
}
