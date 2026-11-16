// oxlint-disable-next-line no-unused-vars -- Entry point consumed by playwright-cli.
async function feedbackRecovery(page) {
  // Run only against the isolated app-ui fixture after the runtime owner coordinates port 4280.
  page.setDefaultTimeout(10000);
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const keep = () => page.getByRole("dialog", { name: "Keep your unsaved changes?", exact: true });
  await page.evaluate(() => window.appFixture?.resetForNavigation());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("http://127.0.0.1:4280/clients");
  await page
    .getByRole("button", { name: /Northstar Studio/ })
    .first()
    .waitFor();
  await page.evaluate(() => {
    window.recoveryClientStatus = 200;
    const original = window.fetch;
    window.fetch = (input, init) => {
      const path = new URL(typeof input === "string" ? input : input.url, location.href).pathname;
      if (/^\/api\/clients\/[^/]+$/.test(path) && window.recoveryClientStatus !== 200)
        return Promise.resolve(
          new Response(JSON.stringify({ error: "Fictional client metadata unavailable" }), {
            status: window.recoveryClientStatus,
            headers: { "Content-Type": "application/json" },
          })
        );
      return original(input, init);
    };
  });
  await page
    .getByRole("button", { name: /Northstar Studio/ })
    .first()
    .click();
  const client = page.getByRole("dialog", { name: "Edit client", exact: true });
  const clientName = client.locator("#edit-client-name");
  await clientName.waitFor({ state: "visible" });
  const clientType = client.getByRole("combobox", { name: "Type", exact: true });
  const clientStatus = client.getByRole("combobox", { name: "Status", exact: true });
  await clientType.focus();
  await page.keyboard.press("Space");
  await page.getByRole("option", { name: "individual", exact: true }).waitFor();
  await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "option");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() =>
    document.querySelector("#edit-client-type")?.textContent.includes("individual")
  );
  assert(
    (await clientType.textContent()).includes("individual"),
    "Named client Type must be keyboard selectable"
  );
  await clientStatus.focus();
  await page.keyboard.press("Space");
  await page.getByRole("option", { name: "inactive", exact: true }).waitFor();
  await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "option");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() =>
    document.querySelector("#edit-client-status")?.textContent.includes("inactive")
  );
  assert(
    (await clientStatus.textContent()).includes("inactive"),
    "Named client Status must be keyboard selectable"
  );
  await clientName.fill("Retained client recovery draft");
  await page.evaluate(async () => {
    window.recoveryClientStatus = 503;
    await window.appFixture.refresh();
  });
  await client.getByRole("alert").filter({ hasText: "Client could not be refreshed" }).waitFor();
  assert(
    (await clientName.inputValue()) === "Retained client recovery draft",
    "A transient failure must retain client input"
  );
  assert(
    await client.getByRole("button", { name: "Save", exact: true }).isDisabled(),
    "Unavailable client metadata must block saving"
  );
  await page.screenshot({
    path: "output/playwright/recovery-client-stale.png",
    animations: "disabled",
  });
  await page.evaluate(() => {
    window.recoveryClientStatus = 200;
  });
  await client.getByRole("button", { name: "Retry client", exact: true }).click();
  await client
    .getByRole("alert")
    .filter({ hasText: "Client could not be refreshed" })
    .waitFor({ state: "hidden" });
  assert(
    (await clientName.inputValue()) === "Retained client recovery draft",
    "Recovery must not reseed over an edit"
  );
  // Native object navigation must use the route guard before unmounting the edit dialog.
  await client.getByRole("link", { name: /Commercial services agreement/ }).click();
  await keep().waitFor();
  await keep().getByRole("button", { name: "Keep editing", exact: true }).click();
  assert(
    (await clientName.inputValue()) === "Retained client recovery draft",
    "Keep editing must retain the client dialog draft"
  );
  await page.evaluate(async () => {
    window.recoveryClientStatus = 403;
    await window.appFixture.refresh();
  });
  await client.getByRole("alert").filter({ hasText: "Client unavailable" }).waitFor();
  assert((await clientName.count()) === 0, "Authoritative denial must hide private client fields");
  assert(
    (await client.getByRole("link", { name: /Commercial services agreement/ }).count()) === 0,
    "Denied client work must not remain navigable"
  );
  await page.evaluate(() => {
    window.recoveryClientStatus = 200;
  });
  await client.getByRole("button", { name: "Retry client", exact: true }).click();
  await clientName.waitFor();
  assert(
    (await clientName.inputValue()) === "Retained client recovery draft",
    "A hidden local draft must survive an explicit authorized retry"
  );
  await client.getByRole("button", { name: "Cancel", exact: true }).click();
  await keep().getByRole("button", { name: "Discard changes", exact: true }).click();
  await client.waitFor({ state: "hidden" });

  await page.evaluate(() => {
    window.sharingRecovery = {
      teamStatus: 200,
      directoryStatus: 200,
      holdDirectory: true,
      people: [
        {
          userId: "demo-reviewer",
          name: "Demo Reviewer",
          email: "reviewer@example.invalid",
          role: "owner",
          addedAt: null,
        },
      ],
    };
    const original = window.fetch;
    window.fetch = (input, init) => {
      const path = new URL(typeof input === "string" ? input : input.url, location.href).pathname;
      const state = window.sharingRecovery;
      const json = (body, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      if (path === "/api/tenant/members") {
        const response = () =>
          json(
            state.directoryStatus === 200
              ? [
                  {
                    id: "demo-reviewer",
                    name: "Demo Reviewer",
                    email: "reviewer@example.invalid",
                    role: "admin",
                  },
                  {
                    id: "fictional-teammate",
                    name: "Fictional Teammate",
                    email: "teammate@example.invalid",
                    role: "member",
                  },
                ]
              : { error: "Fictional directory unavailable" },
            state.directoryStatus
          );
        return state.holdDirectory
          ? new Promise((resolve) => {
              window.releaseRecoveryDirectory = () => {
                state.holdDirectory = false;
                resolve(response());
              };
            })
          : Promise.resolve(response());
      }
      if (/\/api\/clients\/[^/]+\/people$/.test(path)) {
        const response = () =>
          json(
            state.teamStatus === 200
              ? state.people
              : { error: "Fictional team access unavailable" },
            state.teamStatus
          );
        if (state.holdTeam)
          return new Promise((resolve) => {
            window.releaseRecoveryTeam = () => {
              state.holdTeam = false;
              window.releaseRecoveryTeam = null;
              resolve(response());
            };
          });
        return Promise.resolve(response());
      }
      if (/\/api\/clients\/[^/]+\/members\/by-email$/.test(path) && init?.method === "POST") {
        state.holdTeam = true;
        state.people.push({
          userId: "fictional-teammate",
          name: "Fictional Teammate",
          email: "teammate@example.invalid",
          role: "editor",
          addedAt: "2026-11-17T00:00:00.000Z",
        });
        return Promise.resolve(json({ id: "fictional-teammate" }));
      }
      if (
        /\/api\/clients\/[^/]+\/members\/fictional-teammate$/.test(path) &&
        init?.method === "DELETE"
      ) {
        state.holdTeam = true;
        state.people = state.people.filter((person) => person.userId !== "fictional-teammate");
        return Promise.resolve(json(null));
      }
      return original(input, init);
    };
  });
  await page.getByRole("button", { name: "Private", exact: true }).first().click();
  const sharing = page
    .getByRole("dialog")
    .filter({ has: page.getByRole("heading", { name: /People$/ }) });
  await sharing.getByText("Loading organization directory…", { exact: true }).waitFor();
  assert(
    await sharing.getByRole("button", { name: "Add person", exact: true }).isDisabled(),
    "Pending directory metadata must pause adding"
  );
  assert(
    (await page.getByText("Everyone already has access", { exact: true }).count()) === 0,
    "Unknown membership must not become an affirmative empty result"
  );
  await page.evaluate(() => {
    window.sharingRecovery.directoryStatus = 503;
    window.releaseRecoveryDirectory();
  });
  await sharing
    .getByRole("alert")
    .filter({ hasText: "Organization directory unavailable" })
    .waitFor();
  await page.evaluate(() => {
    window.sharingRecovery.directoryStatus = 200;
  });
  await sharing.getByRole("button", { name: "Retry organization directory", exact: true }).click();
  const teammate = sharing.getByRole("combobox", { name: "Organization teammate", exact: true });
  await teammate.click();
  await page.getByRole("option", { name: "Fictional Teammate", exact: true }).click();
  await page.evaluate(async () => {
    window.sharingRecovery.teamStatus = 503;
    await window.appFixture.refresh();
  });
  await sharing
    .getByRole("alert")
    .filter({ hasText: "Team access could not be refreshed" })
    .waitFor();
  assert(
    await sharing.getByRole("button", { name: "Add person", exact: true }).isDisabled(),
    "A stale team snapshot must pause dependent mutations"
  );
  await page.evaluate(() => {
    window.sharingRecovery.teamStatus = 200;
  });
  await sharing.getByRole("button", { name: "Retry team access", exact: true }).click();
  await sharing.getByRole("button", { name: "Add person", exact: true }).click();
  await sharing.getByRole("status").filter({ hasText: "Person added to the team" }).waitFor();
  assert(await sharing.isVisible(), "Success must be available inside the still-open modal");
  await page.waitForFunction(() => typeof window.releaseRecoveryTeam === "function");
  assert(
    await sharing.getByRole("button", { name: "Add person", exact: true }).isDisabled(),
    "An acknowledged add must stay paused until refreshed membership arrives"
  );
  assert(
    await teammate.isDisabled(),
    "Old team candidates must not become actionable during post-write refresh"
  );
  await sharing.getByText("Last loaded team access", { exact: true }).waitFor();
  assert(
    (await sharing.getByText("1 person with access.", { exact: true }).count()) === 0,
    "A retained count cannot claim current access while refresh is pending"
  );
  await page.screenshot({
    path: "output/playwright/recovery-sharing-success.png",
    animations: "disabled",
  });
  await page.evaluate(() => window.releaseRecoveryTeam());
  await sharing.getByText("Fictional Teammate", { exact: true }).waitFor();
  const removePerson = sharing.getByRole("button", { name: "Remove person", exact: true });
  await removePerson.click();
  await sharing.getByRole("status").filter({ hasText: "Person removed from the team" }).waitFor();
  await page.waitForFunction(() => typeof window.releaseRecoveryTeam === "function");
  assert(
    await removePerson.isDisabled(),
    "An acknowledged removal must keep the stale row action paused until refresh completes"
  );
  await page.evaluate(() => window.releaseRecoveryTeam());
  await sharing.getByText("Fictional Teammate", { exact: true }).waitFor({ state: "hidden" });
  await page.evaluate(async () => {
    window.sharingRecovery.teamStatus = 403;
    await window.appFixture.refresh();
  });
  await sharing.getByRole("alert").filter({ hasText: "Team access unavailable" }).waitFor();
  assert(
    (await sharing.getByText("Fictional Teammate", { exact: true }).count()) === 0,
    "Team denial must remove private membership rows"
  );
  assert(
    (await sharing
      .getByRole("combobox", { name: "Organization teammate", exact: true })
      .count()) === 0,
    "Team denial must remove the private candidate picker"
  );
  await sharing.getByRole("button", { name: "Close", exact: true }).click();

  await page.getByRole("link", { name: "Documents", exact: true }).click();
  await page.evaluate(() => {
    window.finishDelayedFeedback = window.appFixture.prepareSuccess(
      "Fictional delayed action confirmed"
    );
  });
  await page.getByRole("link", { name: "Clients", exact: true }).click();
  await page.evaluate(() => window.finishDelayedFeedback());
  await page
    .getByRole("status")
    .filter({ hasText: "Fictional delayed action confirmed" })
    .waitFor();
  assert(
    (
      await page
        .getByRole("status")
        .filter({ hasText: "Fictional delayed action confirmed" })
        .textContent()
    ).includes("Documents"),
    "Completion must retain the captured dispatch section"
  );

  await page.goto("http://127.0.0.1:4280/workflows/assistant/00000040-0000-4000-8000-000000000004");
  const prompt = page.getByRole("textbox", { name: "Workflow prompt", exact: true });
  await prompt.waitFor();
  await page.evaluate(async () => {
    const path = "/api/workflows/" + location.pathname.split("/").pop();
    const initial = await fetch(path).then((response) => response.json());
    window.workflowRecovery = { workflow: initial.workflow, writes: [], releases: [] };
    const original = window.fetch;
    window.fetch = (input, init) =>
      input === path && init?.method === "PATCH"
        ? new Promise((resolve) => {
            const patch = JSON.parse(init.body);
            window.workflowRecovery.writes.push(patch);
            window.workflowRecovery.releases.push(() => {
              window.workflowRecovery.workflow = { ...window.workflowRecovery.workflow, ...patch };
              resolve(
                new Response(JSON.stringify({ workflow: window.workflowRecovery.workflow }), {
                  headers: { "Content-Type": "application/json" },
                })
              );
            });
          })
        : original(input, init);
  });
  await prompt.fill("A confirmed prompt that survives rename ordering");
  await page.waitForFunction(() => window.workflowRecovery.writes.length === 1);
  await page.getByRole("button", { name: "Workflow actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
  const title = page.locator("#workflow-details-title");
  await title.fill("Confirmed renamed workflow");
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await page.waitForTimeout(200);
  assert(
    await page.evaluate(() => window.workflowRecovery.writes.length === 1),
    "Rename cannot bypass the pending autosave queue"
  );
  await page.evaluate(() => window.workflowRecovery.releases.shift()());
  await page.waitForFunction(() => window.workflowRecovery.writes.length === 2);
  await page.evaluate(() => window.workflowRecovery.releases.shift()());
  await page.getByText("Updated", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("heading", { name: "Confirmed renamed workflow", exact: true }).waitFor();
  assert(
    (await prompt.textContent()).trim() === "A confirmed prompt that survives rename ordering",
    "Rename and autosave must retain both confirmed fields"
  );

  await page.getByRole("link", { name: "Documents", exact: true }).click();
  await page.evaluate(() => {
    window.uploadRecovery = { calls: [], retries: false };
    const original = window.fetch;
    window.fetch = (input, init) => {
      if (input === "/api/documents/upload" && init?.method === "POST") {
        const file = init.body.get("file");
        window.uploadRecovery.calls.push(file.name);
        if (file.name === "northstar-mutual-nda-v2.docx" && !window.uploadRecovery.retries)
          return Promise.resolve(
            new Response(JSON.stringify({ error: "Fictional upload response unavailable" }), {
              status: 503,
              headers: { "Content-Type": "application/json" },
            })
          );
        return Promise.resolve(
          new Response(
            JSON.stringify({ id: "fictional-upload-" + file.name, status: "processing" }),
            { headers: { "Content-Type": "application/json" } }
          )
        );
      }
      return original(input, init);
    };
  });
  await page
    .locator('input[type="file"]')
    .setInputFiles([
      "test/acceptance/template-library/fixtures/northstar-mutual-nda-v1.docx",
      "test/acceptance/template-library/fixtures/northstar-mutual-nda-v2.docx",
      "test/acceptance/template-library/fixtures/northstar-mutual-nda-v3.docx",
    ]);
  const uploads = page.getByRole("region", { name: "Upload results", exact: true });
  await uploads.getByText("Result not confirmed", { exact: true }).waitFor();
  assert(
    await page.evaluate(
      () =>
        JSON.stringify(window.uploadRecovery.calls) ===
        JSON.stringify(["northstar-mutual-nda-v1.docx", "northstar-mutual-nda-v2.docx"])
    ),
    "Failure must stop the remaining queue without automatically retrying an uncertain write"
  );
  await uploads.getByText("Not attempted", { exact: true }).waitFor();
  await page.screenshot({
    path: "output/playwright/recovery-upload-partial.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "Per-file recovery must fit mobile"
  );
  await page.screenshot({
    path: "output/playwright/recovery-upload-mobile.png",
    animations: "disabled",
  });
  const firstDocument = page.getByRole("button", { name: "Services agreement.docx", exact: true });
  await firstDocument.scrollIntoViewIfNeeded();
  const documentBox = await firstDocument.boundingBox();
  assert(
    documentBox && documentBox.y >= 0 && documentBox.y + documentBox.height <= 844,
    "Documents must remain reachable while upload results are retained"
  );
  assert(
    (await uploads.getByText("Result not confirmed", { exact: true }).count()) === 1,
    "Inspecting the list must not discard the unconfirmed result"
  );
  await page.screenshot({
    path: "output/playwright/recovery-upload-mobile-documents.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForTimeout(150);
  await page.getByRole("link", { name: "Clients", exact: true }).click();
  await keep().waitFor();
  await keep().getByRole("button", { name: "Keep editing", exact: true }).click();
  await uploads.getByText("northstar-mutual-nda-v3.docx", { exact: true }).waitFor();
  await page.evaluate(() => {
    window.uploadRecovery.retries = true;
  });
  await uploads
    .getByRole("button", { name: "Retry upload: northstar-mutual-nda-v3.docx", exact: true })
    .click();
  await page.waitForFunction(() => window.uploadRecovery.calls.length === 3);
  assert(
    await page.evaluate(() => window.uploadRecovery.calls[2] === "northstar-mutual-nda-v3.docx"),
    "A deliberate retry must send only the chosen file"
  );
  await uploads
    .getByRole("button", {
      name: "Review unconfirmed upload: northstar-mutual-nda-v2.docx",
      exact: true,
    })
    .click();
  const retryDecision = page.getByRole("dialog", {
    name: "Retry an unconfirmed upload?",
    exact: true,
  });
  await retryDecision.waitFor();
  assert(
    await page.evaluate(() => window.uploadRecovery.calls.length === 3),
    "Reviewing an unknown result must not send another upload"
  );
  await retryDecision.getByRole("button", { name: "Keep result", exact: true }).click();
  assert(
    await page.evaluate(() => window.uploadRecovery.calls.length === 3),
    "Cancelling an uncertain retry must send nothing"
  );
  await uploads
    .getByRole("button", {
      name: "Review unconfirmed upload: northstar-mutual-nda-v2.docx",
      exact: true,
    })
    .click();
  await retryDecision.getByRole("button", { name: "Retry anyway", exact: true }).click();
  await uploads.getByText("3 of 3 uploads confirmed", { exact: true }).waitFor();
  assert(
    await page.evaluate(
      () =>
        window.uploadRecovery.calls.filter((name) => name === "northstar-mutual-nda-v1.docx")
          .length === 1
    ),
    "Confirmed files must never be resubmitted by retry"
  );
  await uploads.getByRole("button", { name: "Clear upload results", exact: true }).click();
  return {
    namedClientKeyboardSelections: true,
    clientTransientDraftRecovery: true,
    clientDenialHidesPrivateView: true,
    clientNavigationRetainsDraft: true,
    truthfulSharingMetadata: true,
    sharingWaitsForConfirmedRefresh: true,
    sharingLabelsRetainedAccess: true,
    mobileUploadRecovery: true,
    modalLocalSuccess: true,
    capturedFeedbackOrigin: true,
    orderedRenameAndAutosave: true,
    retainedPerFileOutcomes: true,
    explicitSingleFileRetries: true,
    noAutomaticUncertainRetry: true,
    unknownRetryNeedsConfirmation: true,
    mobileDocumentsRemainReachable: true,
    scope:
      "Production components with fictional browser-only responses. No live authentication, writes, credentials or inference proof.",
  };
}
