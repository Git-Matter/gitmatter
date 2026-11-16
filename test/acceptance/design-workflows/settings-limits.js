// oxlint-disable-next-line no-unused-vars -- Entry point consumed by playwright-cli.
async function settingsLimits(page) {
  page.setDefaultTimeout(10000);
  await page.evaluate(() => window.accountFixture?.resetForNavigation());
  await page.unrouteAll({ behavior: "ignoreErrors" });
  const check = (value, message) => {
    if (!value) throw new Error(message);
  };
  const policy = {
    budgetWindowMinutes: 60,
    tenantTokenLimit: 1000,
    userTokenLimit: 1000,
    matterTokenLimit: 1000,
    tokenTokenLimit: 1000,
    runTokenLimit: 1000,
    tenantCostLimitUsd: 10,
    tenantConcurrency: 2,
    userConcurrency: 2,
    providerConcurrency: { anthropic: 2, gemini: 2, openai: 2, openrouter: 2 },
  };
  let snapshot = {
    revision: 1,
    configured: policy,
    effective: policy,
    scope: "application_llm",
    usage: {
      knownTokens: 0,
      heldTokens: 0,
      knownEstimatedUsd: 0,
      heldEstimatedUsd: 0,
      unpricedAttempts: 0,
    },
    capacity: { queued: 0, running: 0, failed: 0 },
  };
  let status = 200;
  let saveStatus = 503;
  const writes = [];
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (!request.url().startsWith("http://127.0.0.1:4300/")) return route.abort();
    const path = request.url().replace("http://127.0.0.1:4300", "").split("?")[0];
    if (!path.startsWith("/api/")) return route.continue();
    const json = (body, code = 200) =>
      route.fulfill({ status: code, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/admin/job-controls") {
      if (request.method() === "GET")
        return status === 200
          ? json(snapshot)
          : json({ error: "Fictional limits unavailable" }, status);
      const body = request.postDataJSON();
      writes.push(body);
      if (saveStatus !== 200) return json({ error: "Fictional save failed" }, saveStatus);
      snapshot = {
        ...snapshot,
        revision: snapshot.revision + 1,
        configured: body.policy,
        effective: body.policy,
      };
      return json(snapshot);
    }
    if (path === "/api/auth/get-session")
      return json({
        user: {
          id: "fictional-user",
          email: "reviewer@example.invalid",
          name: "Fictional Reviewer",
        },
        session: { id: "fictional-session" },
      });
    if (path === "/api/tenant")
      return json({ id: "fictional-tenant", name: "Fictional firm", storageRegion: "us" });
    if (path === "/api/tenant/storage") return json({ used: 0, limit: 1000000 });
    if (
      path === "/api/tenant/members" ||
      path === "/api/tenant/invites" ||
      path === "/api/matters" ||
      path.startsWith("/api/chats")
    )
      return json([]);
    return json({ error: "Unhandled fictional request" }, 599);
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("http://127.0.0.1:4300/settings?tab=organization");
  await page.getByLabel("Window in minutes").fill("120");
  await page.getByLabel("Reason for this change").fill("Fictional limits adjustment");
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await page.getByRole("link", { name: "Organization", exact: true }).click();
  check(
    (await page.getByLabel("Window in minutes").inputValue()) === "120",
    "Tab change lost limits draft"
  );
  snapshot = { ...snapshot, revision: 2, effective: { ...policy, budgetWindowMinutes: 90 } };
  await page.evaluate(() => window.accountFixture.invalidate("job-controls"));
  await page.getByText("Review limits changed elsewhere", { exact: true }).waitFor();
  check(
    (await page.getByLabel("Window in minutes").inputValue()) === "120",
    "Background revision replaced draft"
  );
  check(
    await page.getByRole("button", { name: "Save review limits" }).isDisabled(),
    "Stale limits can be saved"
  );
  await page
    .getByLabel("Window in minutes")
    .locator("xpath=ancestor::form")
    .evaluate((form) => form.requestSubmit());
  await page.waitForTimeout(100);
  check(writes.length === 0, "Stale form submit bypassed gate");
  await page.getByRole("button", { name: "Load latest limits", exact: true }).click();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  check(
    (await page.getByLabel("Reason for this change").inputValue()) ===
      "Fictional limits adjustment",
    "Keep editing lost limits reason"
  );
  await page.getByRole("button", { name: "Load latest limits", exact: true }).click();
  await page.getByRole("button", { name: "Discard changes", exact: true }).click();
  check(
    (await page.getByLabel("Window in minutes").inputValue()) === "90",
    "Explicit reload did not use current limits"
  );
  check(
    (await page.getByLabel("Reason for this change").inputValue()) === "",
    "Old reason was reused for new revision"
  );
  await page.getByLabel("Window in minutes").fill("180");
  await page.getByLabel("Reason for this change").fill("Fictional revised limits");
  status = 503;
  await page.evaluate(() => window.accountFixture.invalidate("job-controls"));
  await page.getByRole("button", { name: "Retry review limits" }).waitFor();
  check(
    (await page.getByLabel("Window in minutes").inputValue()) === "180",
    "Outage erased limits draft"
  );
  check(
    await page.getByRole("button", { name: "Save review limits" }).isDisabled(),
    "Outage permits limits mutation"
  );
  status = 200;
  await page.getByRole("button", { name: "Retry review limits" }).click();
  await page.waitForFunction(() => !document.querySelector("#limit-reason")?.disabled);
  await page.getByRole("button", { name: "Save review limits" }).click();
  await page.getByRole("button", { name: "Reload current limits" }).waitFor();
  check(
    (await page.getByLabel("Reason for this change").inputValue()) === "Fictional revised limits",
    "Failed limits save erased reason"
  );
  saveStatus = 200;
  await page.getByRole("button", { name: "Save review limits" }).click();
  await page.waitForFunction(() => document.querySelector("#limit-reason")?.value === "");
  check(
    writes.length === 2 && writes.every((write) => write.expectedRevision === 2),
    "Save did not preserve current revision boundary"
  );
  await page.getByRole("link", { name: "Reviews", exact: true }).click();
  await page.getByText("Fictional destination. No product operation was performed.").waitFor();
  return {
    passed: true,
    cases: [
      "cross-tab limits draft",
      "background revision retains draft",
      "stale Enter gate",
      "explicit Keep/Discard reload",
      "503 recovery",
      "failed save retention",
      "revision-bound retry",
      "successful save permits exit",
    ],
    scope:
      "Current limits component with fictional snapshots and intercepted requests; no real policy mutation, spend or authorization proof.",
  };
}
