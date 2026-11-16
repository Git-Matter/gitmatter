// oxlint-disable-next-line no-unused-vars -- Entry point consumed by playwright-cli.
async function authRecovery(page) {
  page.setDefaultTimeout(10000);
  await page.evaluate(() => window.accountFixture?.resetForNavigation());
  await page.unrouteAll({ behavior: "ignoreErrors" });
  const check = (value, message) => {
    if (!value) throw new Error(message);
  };
  const calls = [];
  let configStatus = 503;
  let authStatus = 503;
  let abortNext = false;
  let holdNext = false;
  let finish;
  let challengeFailure = true;
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.url().startsWith("https://challenges.cloudflare.com/turnstile/")) {
      if (challengeFailure) return route.abort();
      return route.fulfill({
        contentType: "application/javascript",
        body: "window.turnstile={render(el,options){window.fictionalChallenge=options;el.textContent='Fictional security check';return 'fictional-widget'},remove(){}};",
      });
    }
    if (!request.url().startsWith("http://127.0.0.1:4300/")) return route.abort();
    const path = request.url().replace("http://127.0.0.1:4300", "").split("?")[0];
    if (!path.startsWith("/api/")) return route.continue();
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    const method = request.method();
    calls.push({ path, method, challenged: Boolean(request.headers()["x-captcha-response"]) });
    if (path === "/api/auth/get-session") return json(null);
    if (path === "/api/config/signup")
      return configStatus === 200
        ? json({ open: true })
        : json({ error: "Fictional availability unavailable" }, configStatus);
    if (method === "GET") return json({ message: "Fictional passkey service unavailable" }, 503);
    if (holdNext) {
      holdNext = false;
      await new Promise((resolve) => {
        finish = resolve;
      });
    }
    if (abortNext) {
      abortNext = false;
      return route.abort();
    }
    if (authStatus !== 200)
      return json({ message: "Fictional request rejected", code: "FIXTURE_REJECTED" }, authStatus);
    if (path === "/api/auth/sign-in/email")
      return json({
        token: "fictional-session",
        user: { id: "fictional-user", email: "reviewer@example.invalid" },
      });
    return json({ status: true });
  });
  const goto = async (path) => {
    await page.evaluate(() => window.accountFixture?.resetForNavigation());
    await page.goto(`http://127.0.0.1:4300${path}`);
  };
  const ready = async () => {
    await page.waitForFunction(() => Boolean(window.fictionalChallenge));
    await page.evaluate(() => window.fictionalChallenge.callback("fictional-challenge-response"));
  };
  const writes = () => calls.filter((call) => call.method === "POST");

  await goto("/signup");
  await page.getByText("Account availability could not be checked.").waitFor();
  check(
    (await page.getByRole("heading", { name: "Signups are closed" }).count()) === 0,
    "Availability error was reported as closed"
  );
  configStatus = 200;
  await page.getByRole("button", { name: "Retry availability check" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Fictional Reviewer");
  await page.getByLabel("Email", { exact: true }).fill("reviewer@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("fictional-test-password");
  await page.getByRole("button", { name: "Retry security check" }).waitFor();
  const beforeChallenge = writes().length;
  await page.locator("form").evaluate((form) => form.requestSubmit());
  await page.waitForTimeout(100);
  check(writes().length === beforeChallenge, "Signup submitted before required challenge");
  challengeFailure = false;
  await page.getByRole("button", { name: "Retry security check" }).click();
  await ready();
  abortNext = true;
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await page.getByRole("alert").waitFor();
  check(
    (await page.getByLabel("Email", { exact: true }).inputValue()) === "reviewer@example.invalid",
    "Signup failure lost email"
  );
  check(
    (await page.getByRole("button", { name: "Sign up", exact: true }).count()) === 1,
    "Signup remains busy after failure"
  );

  await goto("/login?next=https%3A%2F%2Fexample.invalid%2Foutside");
  await page.getByLabel("Email", { exact: true }).fill("reviewer@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("fictional-test-password");
  const beforeLogin = writes().length;
  await page.locator("form").evaluate((form) => form.requestSubmit());
  await page.waitForTimeout(100);
  check(writes().length === beforeLogin, "Login submitted before required challenge");
  await page.getByRole("button", { name: "Sign in with passkey" }).click();
  await page.getByRole("alert").waitFor();
  check(
    await page.getByRole("button", { name: "Sign in with passkey" }).isEnabled(),
    "Rejected passkey cannot retry"
  );
  await ready();
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.getByText("Fictional request rejected", { exact: true }).waitFor();
  check(
    (await page.getByLabel("Password", { exact: true }).inputValue()) === "fictional-test-password",
    "Login failure lost input"
  );
  await ready();
  await page.evaluate(() => window.fictionalChallenge["expired-callback"]());
  await page.getByRole("button", { name: "Retry security check" }).waitFor();
  check(
    await page.getByRole("button", { name: "Log in", exact: true }).isDisabled(),
    "Expired challenge still permits login"
  );
  await page.getByRole("button", { name: "Retry security check" }).click();
  await ready();
  authStatus = 200;
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL("**/assistant");
  check(page.url().startsWith("http://127.0.0.1:4300/"), "External return URL accepted");

  await goto("/forgot-password");
  await page.getByLabel("Email", { exact: true }).fill("reviewer@example.invalid");
  await ready();
  abortNext = true;
  await page.getByRole("button", { name: "Send reset link" }).click();
  await page.getByRole("alert").waitFor();
  check(
    (await page.getByLabel("Email", { exact: true }).inputValue()) === "reviewer@example.invalid",
    "Reset request failure lost email"
  );
  await ready();
  await page.getByRole("button", { name: "Send reset link" }).click();
  await page.getByText("If this email exists in gitmatter, a reset link is on its way.").waitFor();

  await goto("/reset-password");
  await page.getByText("This reset link is missing a token. Request a new link below.").waitFor();
  check(
    await page.getByLabel("New password", { exact: true }).isDisabled(),
    "Missing reset link accepts password"
  );
  await goto("/reset-password?token=fictional-link&error=expired");
  await page.getByText("This reset link is invalid or expired.").waitFor();
  check(
    await page.getByRole("button", { name: "Reset password", exact: true }).isDisabled(),
    "Expired link is actionable"
  );
  await goto("/reset-password?token=fictional-link");
  await page.getByLabel("New password", { exact: true }).fill("fictional-new-password");
  await page.getByLabel("Confirm password", { exact: true }).fill("fictional-other-password");
  check(
    await page.getByRole("button", { name: "Reset password", exact: true }).isDisabled(),
    "Mismatch is actionable"
  );
  await page.getByLabel("Confirm password", { exact: true }).fill("fictional-new-password");
  abortNext = true;
  await page.getByRole("button", { name: "Reset password", exact: true }).click();
  await page.getByRole("alert").waitFor();
  check(
    (await page.getByLabel("New password", { exact: true }).inputValue()) ===
      "fictional-new-password",
    "Reset failure erased password"
  );
  await page.getByRole("button", { name: "Reset password", exact: true }).click();
  await page.getByText("Your password has been changed.").waitFor();

  await goto("/2fa?next=%2Freviews");
  await page.getByLabel("Authenticator code", { exact: true }).fill("123456");
  abortNext = true;
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("alert").waitFor();
  check(
    await page.getByRole("button", { name: "Continue", exact: true }).isEnabled(),
    "Two-factor failure is stuck busy"
  );
  await page.getByRole("button", { name: "Use a backup code" }).click();
  await page.getByLabel("Backup code", { exact: true }).fill("fictional-backup-code");
  holdNext = true;
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  try {
    await page.getByRole("button", { name: "Verifying...", exact: true }).waitFor();
    check(
      await page.getByRole("button", { name: "Use authenticator code" }).isDisabled(),
      "Verification method changes while request is pending"
    );
    await page.getByLabel("Backup code", { exact: true }).press("Enter");
  } finally {
    for (let i = 0; i < 20 && !finish; i++) await page.waitForTimeout(25);
    finish?.();
  }
  await page.waitForURL("**/reviews");
  check(
    writes().filter((call) => call.path === "/api/auth/two-factor/verify-backup-code").length === 1,
    "Pending verification submitted twice"
  );

  await goto("/verify-email?email=reviewer%40example.invalid&next=%2Freviews");
  abortNext = true;
  await page.getByRole("button", { name: "Send verification link", exact: true }).click();
  await page.getByRole("alert").waitFor();
  await page.getByRole("button", { name: "Send verification link", exact: true }).click();
  await page.getByText("A verification link was requested for", { exact: false }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  check(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "Authentication page overflows mobile width"
  );
  await page.screenshot({ path: "output/playwright/design-workflows/auth-mobile.png" });
  check(
    writes()
      .filter((call) =>
        [
          "/api/auth/sign-in/email",
          "/api/auth/sign-up/email",
          "/api/auth/request-password-reset",
        ].includes(call.path)
      )
      .every((call) => call.challenged),
    "A password entry request omitted its required challenge"
  );
  return {
    passed: true,
    cases: [
      "availability failure vs closed",
      "challenge load failure and retry",
      "Enter readiness gate",
      "signup/login network recovery",
      "passkey service rejection",
      "challenge expiry",
      "safe external return rejection",
      "password reset missing/expired/mismatch/error/success",
      "two-factor retry and single pending request",
      "local return path",
      "verification retry and requested wording",
      "390px reflow",
    ],
    scope:
      "Actual product routes and Better Auth browser client with intercepted fictional requests and challenge callbacks; no real sign-in, mail, credentials, hardware passkeys or server challenge verification.",
  };
}
