// oxlint-disable-next-line no-unused-vars -- Entry point consumed by playwright-cli.
async function settingsNavigation(page) {
  page.setDefaultTimeout(10000);
  await page.evaluate(() => window.accountFixture?.resetForNavigation());
  const check = (value, message) => {
    if (!value) throw new Error(message);
  };
  const calls = [];
  let profileStatus = 503;
  let keysStatus = 200;
  let invitesStatus = 200;
  let releaseProfile;
  let holdProfile = false;
  await page.unrouteAll({ behavior: "ignoreErrors" });
  const session = {
    user: {
      id: "fictional-user",
      name: "Fictional Reviewer",
      email: "reviewer@example.invalid",
      emailVerified: true,
    },
    session: {
      id: "fictional-session",
      userId: "fictional-user",
      expiresAt: "2099-01-01T00:00:00Z",
    },
  };
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (!request.url().startsWith("http://127.0.0.1:4300/")) return route.abort();
    const path = request.url().replace("http://127.0.0.1:4300", "").split("?")[0];
    if (!path.startsWith("/api/")) return route.continue();
    const method = request.method();
    calls.push({ path, method });
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/auth/get-session") return json(session);
    if (path === "/api/auth/passkey/list-user-passkeys") return json([]);
    if (path === "/api/auth/update-user") {
      if (holdProfile)
        await new Promise((resolve) => {
          releaseProfile = resolve;
        });
      return profileStatus === 200
        ? json({ status: true })
        : json(
            { message: "Fictional profile save failed", code: "FIXTURE_FAILURE" },
            profileStatus
          );
    }
    if (path === "/api/settings") return json({ jurisdiction: "US" });
    if (path === "/api/keys")
      return keysStatus === 200
        ? json({ providers: [{ provider: "anthropic", hasUserKey: true, source: "user" }] })
        : json({ error: "Fictional configuration unavailable" }, keysStatus);
    if (path === "/api/keys/courtlistener") return json({ hasUserKey: false });
    if (path === "/api/tenant")
      return json({ id: "fictional-tenant", name: "Fictional firm", storageRegion: "us" });
    if (path === "/api/tenant/members")
      return json([
        {
          id: "fictional-user",
          name: "Fictional Reviewer",
          email: "reviewer@example.invalid",
          role: "admin",
        },
      ]);
    if (path === "/api/tenant/storage") return json({ used: 0, limit: 1000000 });
    if (path === "/api/tenant/invites")
      return invitesStatus === 200
        ? json([])
        : json({ error: "Fictional invitation check failed" }, invitesStatus);
    if (path === "/api/admin/job-controls") return json({ error: "Fictional role denied" }, 403);
    if (path === "/api/tokens" || path === "/api/matters" || path.startsWith("/api/chats"))
      return json([]);
    return json({ error: "Unhandled fictional request" }, 599);
  });
  await page.goto("http://127.0.0.1:4300/settings");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel("Name", { exact: true }).first().waitFor();
  check(
    !calls.some((call) => call.path === "/api/keys" || call.path === "/api/tenant/invites"),
    "Unvisited settings eagerly queried configuration"
  );
  await page.getByLabel("Name", { exact: true }).first().fill("Fictional profile draft");
  await page.getByRole("link", { name: "AI & Models" }).click();
  await page.getByLabel("Claude (Anthropic)", { exact: true }).waitFor();
  check(
    (await page.evaluate(() => window.accountFixture.location())).includes("tab=ai"),
    "Tab did not update URL"
  );
  await page.getByLabel("Claude (Anthropic)", { exact: true }).fill("fictional-key-never-sent");
  await page.getByRole("link", { name: "Account", exact: true }).click();
  check(
    (await page.getByLabel("Name", { exact: true }).first().inputValue()) ===
      "Fictional profile draft",
    "Tab switch discarded profile draft"
  );
  await page.getByLabel("Claude (Anthropic)", { exact: true }).waitFor({ state: "hidden" });
  await page.evaluate(() => window.accountFixture.back());
  await page.getByLabel("Claude (Anthropic)", { exact: true }).waitFor();
  check(
    (await page.getByLabel("Claude (Anthropic)", { exact: true }).inputValue()) ===
      "fictional-key-never-sent",
    "Back discarded provider input"
  );
  await page.evaluate(() => window.accountFixture.forward());
  await page.getByLabel("Name", { exact: true }).first().waitFor();
  await page.getByRole("link", { name: "Reviews", exact: true }).click();
  await page.getByRole("dialog", { name: "Keep your unsaved changes?" }).waitFor();
  check((await page.getByRole("dialog").count()) === 1, "Multiple draft prompts compete");
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  check(
    (await page.getByLabel("Name", { exact: true }).first().inputValue()) ===
      "Fictional profile draft",
    "Keep editing lost draft"
  );
  const accountCard = page
    .locator("[data-slot=card]")
    .filter({ has: page.getByLabel("Name", { exact: true }) })
    .first();
  await accountCard.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Fictional profile save failed", { exact: true }).waitFor();
  check(
    (await page.getByLabel("Name", { exact: true }).first().inputValue()) ===
      "Fictional profile draft",
    "Failed save lost input"
  );
  profileStatus = 200;
  holdProfile = true;
  await accountCard.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#profile-name")?.disabled);
  try {
    await page.getByRole("link", { name: "Reviews", exact: true }).click();
    await page.getByRole("dialog", { name: "Saving your changes" }).waitFor();
    check(
      await page.getByRole("button", { name: "Discard changes", exact: true }).isDisabled(),
      "Pending save can be discarded as cancelled"
    );
    await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  } finally {
    for (let i = 0; i < 20 && !releaseProfile; i++) await page.waitForTimeout(25);
    releaseProfile?.();
  }
  await accountCard.getByRole("button", { name: "Save", exact: true }).waitFor();
  await page.getByRole("link", { name: "AI & Models" }).click();
  keysStatus = 503;
  await page.evaluate(() => window.accountFixture.invalidate("keys"));
  await page.getByRole("button", { name: "Retry Provider configuration" }).waitFor();
  check(
    (await page.getByLabel("Claude (Anthropic)", { exact: true }).inputValue()) ===
      "fictional-key-never-sent",
    "Transient refresh lost provider draft"
  );
  check(
    await page.getByLabel("Claude (Anthropic)", { exact: true }).isDisabled(),
    "Unverified configuration can be mutated"
  );
  keysStatus = 200;
  await page.getByRole("button", { name: "Retry Provider configuration" }).click();
  await page.waitForFunction(() => !document.querySelector("#provider-key-anthropic")?.disabled);
  keysStatus = 403;
  await page.evaluate(() => window.accountFixture.invalidate("keys"));
  check(
    (await page.getByLabel("Claude (Anthropic)", { exact: true }).count()) === 0,
    "Denied provider configuration remains exposed"
  );
  invitesStatus = 503;
  await page.getByRole("link", { name: "Organization", exact: true }).click();
  await page.getByRole("button", { name: "Retry invitation access" }).waitFor();
  check(
    (await page.getByLabel("Invite a teammate").count()) === 0,
    "Failed permission check implies admin access"
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("combobox", { name: "Settings section" }).selectOption("data");
  await page.getByRole("button", { name: "Retry Data export access" }).waitFor();
  check(
    (await page.getByRole("button", { name: "Export tenant data", exact: true }).count()) === 0,
    "Unverified access exposes organization export"
  );
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  const drawer = page.getByRole("dialog", { name: "Workspace navigation" });
  await drawer.waitFor();
  await page.keyboard.press("Tab");
  check(
    await drawer.evaluate((element) => element.contains(document.activeElement)),
    "Drawer focus escapes to page"
  );
  await page.keyboard.press("Escape");
  await drawer.waitFor({ state: "hidden" });
  check(
    await page
      .getByRole("button", { name: "Expand sidebar" })
      .evaluate((element) => element === document.activeElement),
    "Drawer close does not return focus"
  );
  check(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "Narrow settings overflow page"
  );
  await page.screenshot({ path: "output/playwright/design-workflows/settings-mobile.png" });
  await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
  await page.getByRole("link", { name: "Reviews", exact: true }).click();
  // The denied key draft was removed; the profile was successfully saved. No unfinished work remains.
  await page.getByText("Fictional destination. No product operation was performed.").waitFor();
  const writes = calls.filter((call) => call.method !== "GET");
  check(
    writes.length === 2 && writes.every((call) => call.path === "/api/auth/update-user"),
    "Unexpected external operation requested"
  );
  return {
    passed: true,
    cases: [
      "lazy panels",
      "URL tabs and history",
      "cross-tab drafts",
      "single exit decision",
      "failed-save retention",
      "pending-save protection",
      "503 retained readonly configuration",
      "403 removal",
      "permission check recovery",
      "mobile tabs",
      "navigation modal keyboard and focus",
      "no unintended operations",
    ],
    scope:
      "Current production components and real Better Auth browser client in isolated memory router; fictional responses; no live authentication, credentials, emails or server authorization.",
  };
}
