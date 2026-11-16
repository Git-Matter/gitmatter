// oxlint-disable-next-line no-unused-vars -- Moderator setup; no participant task is automated.
async function studySetup(page) {
  await page.evaluate(() => window.accountFixture?.resetForNavigation());
  await page.unrouteAll({ behavior: "ignoreErrors" });
  const calls = [];
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
    if (!request.url().startsWith("http://127.0.0.1:4280/")) return route.abort();
    const path = request.url().replace("http://127.0.0.1:4280", "").split("?")[0];
    if (!path.startsWith("/api/")) return route.continue();
    const method = request.method();
    calls.push({ path, method });
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (method !== "GET")
      return json(
        {
          message: "Fictional request did not receive confirmation. No real operation was sent.",
          error: "Fictional operation blocked",
          code: "STUDY_FAILURE",
        },
        503
      );
    if (path === "/api/auth/get-session") return json(session);
    if (path === "/api/auth/passkey/list-user-passkeys") return json([]);
    if (path === "/api/settings") return json({ jurisdiction: "US" });
    if (path === "/api/keys")
      return json({ providers: [{ provider: "anthropic", hasUserKey: false, source: "none" }] });
    if (path === "/api/keys/courtlistener") return json({ hasUserKey: false });
    if (path === "/api/matters" || path.startsWith("/api/chats")) return json([]);
    return json({ error: "Outside this study task" }, 599);
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("http://127.0.0.1:4280/settings");
  await page.getByLabel("Name", { exact: true }).first().waitFor();
  // Only method/path counts are exposed to the moderator; no entered values are collected.
  await page.exposeFunction("studyRequestSummary", () => ({
    signOutAttempts: calls.filter((call) => call.path === "/api/auth/sign-out").length,
    writes: calls.filter((call) => call.method !== "GET"),
  }));
  return {
    status: "READY_FOR_HUMAN_OBSERVATION",
    participantTasksExecuted: 0,
    scope:
      "Fictional settings/sign-out prototype. All API and remote requests intercepted; all writes fail deliberately. This is setup, not usability evidence.",
  };
}
