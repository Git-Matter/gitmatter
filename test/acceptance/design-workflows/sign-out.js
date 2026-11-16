// oxlint-disable-next-line no-unused-vars -- Entry point consumed by playwright-cli.
async function signOutWorkflow(page) {
  page.setDefaultTimeout(10000);
  await page.evaluate(() => window.accountFixture?.resetForNavigation());
  await page.unrouteAll({ behavior: "ignoreErrors" });
  const check = (value, message) => {
    if (!value) throw new Error(message);
  };
  const calls = [];
  let status = 503;
  let abortNext = false;
  let holdSignOut = false;
  let releaseSignOut;
  let releaseProfile;
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
    calls.push({ path, method: request.method() });
    const json = (body, code = 200) =>
      route.fulfill({ status: code, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/auth/get-session") return json(locationForSession() ? session : null);
    if (path === "/api/auth/passkey/list-user-passkeys") return json([]);
    if (path === "/api/auth/update-user") {
      await new Promise((resolve) => {
        releaseProfile = resolve;
      });
      return json({ status: true });
    }
    if (path === "/api/auth/sign-out") {
      if (holdSignOut)
        await new Promise((resolve) => {
          releaseSignOut = resolve;
        });
      if (abortNext) {
        abortNext = false;
        return route.abort();
      }
      return status === 200
        ? json({ success: true })
        : json({ message: "Fictional sign-out rejected", code: "FIXTURE_FAILURE" }, status);
    }
    if (path === "/api/matters" || path.startsWith("/api/chats")) return json([]);
    return json({ error: "Unhandled fictional request" }, 599);
  });
  function locationForSession() {
    return !page.url().includes("/login");
  }
  const countSignOut = () => calls.filter((call) => call.path === "/api/auth/sign-out").length;
  const chooseSignOut = async () => {
    await page.getByRole("button", { name: "Open user menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("http://127.0.0.1:4300/settings");
  const name = page.getByLabel("Name", { exact: true }).first();
  await name.fill("Fictional unsaved name");
  await page.getByRole("button", { name: "Open user menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).hover();
  await page.waitForTimeout(150);
  check(countSignOut() === 0, "Hover ended the session");
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await page.getByRole("dialog", { name: "Keep your unsaved changes?" }).waitFor();
  check(countSignOut() === 0, "Sign-out request preceded the discard decision");
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  check((await name.inputValue()) === "Fictional unsaved name", "Keep editing lost the draft");
  const card = page.locator("[data-slot=card]").filter({ has: name }).first();
  await card.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#profile-name")?.disabled);
  try {
    await chooseSignOut();
    await page.getByRole("dialog", { name: "Saving your changes" }).waitFor();
    check(
      await page.getByRole("button", { name: "Discard changes", exact: true }).isDisabled(),
      "Sign-out can discard a pending save"
    );
    check(countSignOut() === 0, "Pending-save exit sent sign-out");
    await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  } finally {
    for (let i = 0; i < 20 && !releaseProfile; i++) await page.waitForTimeout(25);
    releaseProfile?.();
  }
  await page.waitForFunction(() => !document.querySelector("#profile-name")?.disabled);
  await name.fill("Fictional deliberately discarded draft");
  await chooseSignOut();
  await page.getByRole("button", { name: "Discard changes", exact: true }).click();
  await page.getByRole("button", { name: "Retry sign-out", exact: true }).waitFor();
  check(countSignOut() === 1, "Explicit discard did not send exactly one request");
  check(
    (await page.evaluate(() => window.accountFixture.location())).startsWith("/sign-out"),
    "Rejected sign-out redirected to login"
  );
  await page.waitForTimeout(100);
  check(countSignOut() === 1, "Rejected sign-out automatically retried");
  abortNext = true;
  await page.getByRole("button", { name: "Retry sign-out", exact: true }).click();
  await page.getByRole("alert").waitFor();
  check(countSignOut() === 2, "Network failure retry did not dispatch once");
  await page.setViewportSize({ width: 390, height: 844 });
  check(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "Sign-out recovery overflows mobile"
  );
  await page.screenshot({ path: "output/playwright/design-workflows/signout-error-mobile.png" });
  status = 200;
  holdSignOut = true;
  await page.getByRole("button", { name: "Retry sign-out", exact: true }).click();
  try {
    await page.getByRole("button", { name: "Signing out…", exact: true }).waitFor();
    check(
      await page.getByRole("button", { name: "Signing out…", exact: true }).isDisabled(),
      "Pending sign-out action permits duplicate requests"
    );
    check(
      (await page.getByRole("button", { name: "Return to workspace", exact: true }).count()) === 0,
      "Pending sign-out is presented as cancelled"
    );
    check(countSignOut() === 3, "Sign-out duplicated a pending request");
  } finally {
    for (let i = 0; i < 20 && !releaseSignOut; i++) await page.waitForTimeout(25);
    releaseSignOut?.();
  }
  await page.waitForURL("**/login");
  check(countSignOut() === 3, "Confirmed sign-out repeated after redirect");
  // A URL cannot carry the private history-state action signal.
  holdSignOut = false;
  status = 503;
  await page.goto("http://127.0.0.1:4300/sign-out?signOutRequested=true");
  await page.getByRole("button", { name: "Sign out", exact: true }).waitFor();
  await page.waitForTimeout(100);
  check(countSignOut() === 3, "Direct URL/query caused sign-out without an action");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("button", { name: "Retry sign-out", exact: true }).waitFor();
  check(countSignOut() === 4, "Direct-entry confirmation did not act once");
  return {
    passed: true,
    cases: [
      "no request on hover",
      "Keep sends nothing and preserves draft",
      "pending save blocks sign-out",
      "discard before request",
      "rejection remains recoverable",
      "network failure retry",
      "single pending request",
      "confirmed login reload",
      "direct URL and query do not act",
      "explicit direct-entry action",
      "390px recovery",
    ],
    scope:
      "Current sidebar/sign-out route, shared draft guard and real Better Auth browser client with intercepted fictional requests. No real session was ended; no server-auth or native cross-browser prompt claim.",
  };
}
