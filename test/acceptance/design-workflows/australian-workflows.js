// oxlint-disable-next-line no-unused-vars -- Entry point consumed by playwright-cli.
async function australianWorkflows(page) {
  page.setDefaultTimeout(10000);
  await page.evaluate(() => window.australianFixture?.resetForNavigation());
  await page.unrouteAll({ behavior: "ignoreErrors" });
  const check = (value, message) => {
    if (!value) throw new Error(message);
  };
  const calls = [];
  const unknown = [];
  let prepareStatus = 503;
  let profileStatus = 200;
  let saveProfileStatus = 503;
  let reviewStatus = 200;
  let saveReviewStatus = 409;
  let version = "version-1";
  let head = "content-1";
  let tokenDigit = "a";
  let currentReview = null;
  let hold = "";
  let release;
  let profile = {
    displayName: "Fictional practice",
    correspondenceHeader: "Fictional address",
    signOff: "Kind regards",
    jurisdiction: "AU-NSW",
    instructions: "Use plain English.",
  };
  const source = {
    id: "fictional-document",
    title: "Fictional agreement",
    status: "ready",
    fileType: "text/markdown",
  };
  const reviewState = () => ({
    documentId: source.id,
    documentTitle: source.title,
    documentVersionId: version,
    documentHeadCommitId: head,
    stateToken: `v1:${tokenDigit.repeat(64)}`,
    canReview: true,
    blockedReason: null,
    currentReview,
    history: currentReview ? [{ ...currentReview, current: true }] : [],
  });
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (!request.url().startsWith("http://127.0.0.1:4280/")) return route.abort();
    const path = request.url().replace("http://127.0.0.1:4280", "").split("?")[0];
    if (!path.startsWith("/api/")) return route.continue();
    const method = request.method();
    const body = request.postDataJSON();
    calls.push({ path, method, body });
    const json = (value, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if ((hold === "profile" && method === "PUT") || (hold === "review" && method === "POST"))
      await new Promise((resolve) => {
        release = resolve;
      });
    if (path === "/api/practice-profile") {
      if (method === "PUT") {
        if (saveProfileStatus !== 200)
          return json({ error: "Fictional practice save failed" }, saveProfileStatus);
        profile = body;
      } else if (profileStatus !== 200)
        return json({ error: "Fictional practice access unavailable" }, profileStatus);
      return json({ profile, canEdit: true });
    }
    if (path === "/api/matters")
      return json([
        {
          matter: {
            id: "fictional-matter",
            name: "Fictional matter",
            status: "open",
            jurisdiction: "AU-NSW",
          },
          client: { name: "Fictional client" },
          role: "owner",
        },
      ]);
    if (path === "/api/documents") return json([source]);
    if (path === "/api/guided/prepare") {
      if (prepareStatus !== 200)
        return json({ error: "Fictional source check failed" }, prepareStatus);
      return json({
        version: 1,
        task: body.task,
        matterId: body.matterId,
        jurisdiction: body.jurisdiction,
        prompt: `Fictional prepared prompt: ${body.instructions}`,
        attachments: [{ ...source, kind: "document", label: source.title }],
      });
    }
    if (path === "/api/guided/sample")
      return json({ matterId: "fictional-matter", documentIds: [source.id] });
    if (path === `/api/documents/${source.id}/review`) {
      if (method === "POST") {
        if (saveReviewStatus !== 200)
          return json({ error: "Fictional source revision changed" }, saveReviewStatus);
        currentReview = {
          id: "fictional-review",
          reviewerName: "Fictional Reviewer",
          reviewedAt: "2026-11-16T12:00:00Z",
          scope: body.scope,
          documentVersionId: version,
          stateToken: body.expectedStateToken,
          commitId: "fictional-commit",
        };
      } else if (reviewStatus !== 200)
        return json({ error: "Fictional review access denied" }, reviewStatus);
      return json(reviewState());
    }
    unknown.push(path);
    return json({ error: "Unhandled fictional request" }, 599);
  });
  const resetTo = async (path) => {
    await page.evaluate(() => window.australianFixture?.resetForNavigation());
    await page.goto(`http://127.0.0.1:4280${path}`);
  };

  await page.setViewportSize({ width: 1440, height: 1000 });
  await resetTo("/assistant");
  await page.getByRole("button", { name: "Prepare a file briefing", exact: true }).click();
  const guided = page.getByRole("dialog", { name: "Help me understand this file", exact: true });
  await guided.getByLabel("Matter", { exact: true }).selectOption("fictional-matter");
  await guided.getByRole("checkbox", { name: /Fictional agreement/ }).check();
  const instructions = guided.getByLabel("Your client’s role and instructions", { exact: true });
  await instructions.fill("We act for the fictional customer. Check the payment commitments.");
  await page.keyboard.press("Escape");
  const discard = page.getByRole("dialog", { name: "Keep your unsaved changes?", exact: true });
  await discard.waitFor();
  await discard.getByRole("button", { name: "Keep editing", exact: true }).click();
  check(
    (await instructions.inputValue()).includes("fictional customer"),
    "Guided Escape/Keep lost instructions"
  );
  await guided.getByRole("button", { name: "Prepare instructions", exact: true }).click();
  await guided.getByText("Fictional source check failed", { exact: true }).waitFor();
  check(
    (await instructions.inputValue()).includes("payment commitments"),
    "Failed preparation lost instructions"
  );
  prepareStatus = 200;
  await guided.getByRole("button", { name: "Prepare instructions", exact: true }).click();
  const prompt = guided.getByLabel("Review and edit the prepared instructions", { exact: true });
  await prompt.fill("Fictional customized briefing instructions retained for review.");
  await guided.getByLabel("Applicable jurisdiction", { exact: true }).selectOption("AU-VIC");
  check(
    (await prompt.inputValue()).includes("customized"),
    "Scope change dropped the prepared prompt"
  );
  await guided.getByText(/The selection changed/).waitFor();
  await guided.getByRole("button", { name: "Prepare updated instructions", exact: true }).click();
  await guided.getByRole("button", { name: "Use in assistant", exact: true }).waitFor();
  await prompt.fill("Fictional final checked instructions.");
  await guided.getByRole("button", { name: "Use in assistant", exact: true }).click();
  await guided.waitFor({ state: "hidden" });
  const seed = JSON.parse(await page.getByTestId("prepared-draft").textContent());
  check(
    seed.prompt === "Fictional final checked instructions." &&
      seed.jurisdiction === "AU-VIC" &&
      seed.matterId === "fictional-matter",
    "Guided draft callback changed scope or prompt"
  );
  check(seed.attachments[0].id === source.id, "Guided draft lost source identity");
  check(
    !calls.some((call) => /chat|execute|runs/.test(call.path)),
    "Preparation dispatched an inference request"
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Prepare a file briefing", exact: true }).click();
  await instructions.fill("Fictional mobile draft to keep or discard deliberately.");
  await guided.getByRole("button", { name: "Cancel", exact: true }).click();
  await discard.waitFor();
  await discard.getByRole("button", { name: "Keep editing", exact: true }).click();
  check(
    (await instructions.inputValue()).includes("mobile draft"),
    "Mobile Keep lost guided input"
  );
  check(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "Mobile guided dialog overflowed"
  );
  await page.screenshot({
    path: "output/playwright/design-workflows/au/guided-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await guided.getByRole("button", { name: "Cancel", exact: true }).click();
  await discard.getByRole("button", { name: "Discard changes", exact: true }).click();
  await guided.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Prepare a file briefing", exact: true }).click();
  check((await instructions.inputValue()) === "", "Discarded guided draft reappeared");
  await guided.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });

  await resetTo("/settings?tab=practice");
  const name = page.getByLabel("Practice name", { exact: true });
  await name.fill("Fictional retained practice draft");
  await page.getByRole("link", { name: "Other retained section", exact: true }).click();
  await name.waitFor({ state: "hidden" });
  await page.getByRole("link", { name: "Your practice", exact: true }).click();
  check(
    (await name.inputValue()) === "Fictional retained practice draft",
    "Settings section change discarded practice input"
  );
  profile = { ...profile, displayName: "Remote fictional practice update" };
  await page.evaluate(() => window.australianFixture.invalidate("practice-profile"));
  check(
    (await name.inputValue()) === "Fictional retained practice draft",
    "Refetch replaced dirty practice input"
  );
  profileStatus = 503;
  await page.evaluate(() => window.australianFixture.invalidate("practice-profile"));
  check(
    (await name.inputValue()) === "Fictional retained practice draft" && (await name.isDisabled()),
    "Transient practice refresh did not retain and fence draft"
  );
  profileStatus = 200;
  await page.getByRole("button", { name: "Retry Practice preferences", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("#practice-name")?.matches(":disabled"));
  await page.getByRole("button", { name: "Save practice preferences", exact: true }).click();
  await page.getByText("Fictional practice save failed", { exact: true }).waitFor();
  check(
    (await name.inputValue()) === "Fictional retained practice draft",
    "Failed practice save lost draft"
  );
  await page.getByRole("link", { name: "Leave fixture surface", exact: true }).click();
  await discard.waitFor();
  await discard.getByRole("button", { name: "Keep editing", exact: true }).click();
  saveProfileStatus = 200;
  hold = "profile";
  await page.getByRole("button", { name: "Save practice preferences", exact: true }).click();
  try {
    await page.waitForFunction(() =>
      document.querySelector("#practice-name")?.matches(":disabled")
    );
    await page.getByRole("link", { name: "Leave fixture surface", exact: true }).click();
    const pending = page.getByRole("dialog", { name: "Saving your changes", exact: true });
    await pending.waitFor();
    check(
      await pending.getByRole("button", { name: "Discard changes", exact: true }).isDisabled(),
      "Pending preference save could be discarded"
    );
    await pending.getByRole("button", { name: "Keep editing", exact: true }).click();
  } finally {
    hold = "";
    release?.();
  }
  await page.waitForFunction(() => !document.querySelector("#practice-name")?.matches(":disabled"));
  check(
    (await name.inputValue()) === "Fictional retained practice draft",
    "Saved practice did not preserve confirmed value"
  );
  await page.screenshot({
    path: "output/playwright/design-workflows/au/practice-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  profileStatus = 403;
  await page.evaluate(() => window.australianFixture.invalidate("practice-profile"));
  await name.waitFor({ state: "hidden" });
  await page.getByText(/Could not load practice preferences/).waitFor();

  await resetTo(`/documents/${source.id}`);
  const scope = page.getByLabel("What did you check?", { exact: true });
  await scope.fill("Fictional scope for the exact first source version.");
  await page.evaluate(() =>
    window.australianFixture.setDocument({
      versionId: "version-1",
      headCommitId: "content-1",
      text: "Fictional source text for version 1.",
      ready: true,
      available: false,
    })
  );
  await scope.waitFor({ state: "hidden" });
  await page.getByRole("link", { name: "Leave fixture surface", exact: true }).click();
  const scopeExit = page.getByRole("dialog", {
    name: "Keep your unfinished review record?",
    exact: true,
  });
  await scopeExit.waitFor();
  await scopeExit.getByRole("button", { name: "Keep editing", exact: true }).click();
  await page.evaluate(() =>
    window.australianFixture.setDocument({
      versionId: "version-1",
      headCommitId: "content-1",
      text: "Fictional source text for version 1.",
      ready: true,
      available: true,
    })
  );
  check(
    (await scope.inputValue()) === "Fictional scope for the exact first source version.",
    "Unavailable detail unmount discarded scope draft"
  );
  version = "version-2";
  head = "content-2";
  tokenDigit = "b";
  await page.evaluate(() =>
    window.australianFixture.setDocument({
      versionId: "version-2",
      headCommitId: "content-2",
      text: "Fictional changed source text.",
      ready: true,
    })
  );
  await page.waitForFunction(
    () => document.querySelector("#review-scope-fictional-document")?.value === ""
  );
  await page.getByText(/Unfinished scopes from earlier document versions/).click();
  await page
    .getByText("Fictional scope for the exact first source version.", { exact: true })
    .waitFor();
  await scope.fill("Fictional current scope; checked parties and payment terms.");
  await page.evaluate(() =>
    window.australianFixture.setDocument({
      versionId: "version-2",
      headCommitId: "content-2",
      text: "",
      ready: true,
    })
  );
  check(
    await page.getByRole("button", { name: "Record my review", exact: true }).isDisabled(),
    "Blank displayed source permitted review"
  );
  await page.waitForFunction(() =>
    document.querySelector("#review-scope-fictional-document")?.matches(":disabled")
  );
  check(await scope.isDisabled(), "Blank displayed source allowed editable attestation");
  await page.evaluate(() =>
    window.australianFixture.setDocument({
      versionId: "version-2",
      headCommitId: "content-2",
      text: "Fictional changed source text.",
      ready: true,
    })
  );
  const confirmation = page.getByRole("checkbox", {
    name: "I personally checked the document shown here within the scope above.",
    exact: true,
  });
  await confirmation.check();
  await page.getByRole("button", { name: "Record my review", exact: true }).click();
  await page.getByText("Fictional source revision changed", { exact: true }).waitFor();
  check(
    (await scope.inputValue()).includes("current scope") && !(await confirmation.isChecked()),
    "Rejected review did not retain scope and require reconfirmation"
  );
  saveReviewStatus = 200;
  hold = "review";
  await confirmation.check();
  await page.getByRole("button", { name: "Record my review", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector("#review-scope-fictional-document")?.disabled
  );
  try {
    await page.getByRole("link", { name: "Leave fixture surface", exact: true }).click();
    const pending = page.getByRole("dialog", { name: "Saving your changes", exact: true });
    await pending.waitFor();
    check(
      await pending.getByRole("button", { name: "Discard changes", exact: true }).isDisabled(),
      "Pending practitioner record could be discarded"
    );
    await pending.getByRole("button", { name: "Keep editing", exact: true }).click();
  } finally {
    hold = "";
    release?.();
  }
  await page.getByText("Reviewed version", { exact: true }).waitFor();
  check(
    (await scope.inputValue()) === "",
    "Confirmed practitioner record did not clear only its current scope"
  );
  const recorded = calls
    .filter((call) => call.path.endsWith("/review") && call.method === "POST")
    .at(-1);
  check(
    recorded.body.expectedStateToken === `v1:${"b".repeat(64)}` &&
      recorded.body.scope.includes("current scope") &&
      !Object.hasOwn(recorded.body, "revision"),
    "Review payload lost exact token/scope or leaked local revision key"
  );
  await page.setViewportSize({ width: 390, height: 844 });
  check(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "Current practitioner panel overflows mobile viewport"
  );
  await page.screenshot({
    path: "output/playwright/design-workflows/au/review-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  const fullVersion = "b42dfc81-93fe-4bd8-a326-17b8bc4f78ac";
  const fullHead = "fd5c4efb4ecf20919df88c5fa1d0c3b36d8e9432";
  version = fullVersion;
  head = fullHead;
  tokenDigit = "c";
  currentReview = null;
  await page.evaluate(
    ({ versionId, headCommitId }) =>
      window.australianFixture.setDocument({
        versionId,
        headCommitId,
        text: "Fictional full-identity source.",
        ready: true,
      }),
    { versionId: fullVersion, headCommitId: fullHead }
  );
  await scope.fill("Retained scope belonging to the full stored source identifiers.");
  version = null;
  head = null;
  tokenDigit = "d";
  await page.evaluate(() =>
    window.australianFixture.setDocument({
      versionId: null,
      headCommitId: null,
      text: "Fictional source without stored identifiers.",
      ready: true,
    })
  );
  await page.waitForFunction(
    () => document.querySelector("#review-scope-fictional-document")?.value === ""
  );
  const earlierScopes = page.getByText(/Unfinished scopes from earlier document versions/);
  if (!(await earlierScopes.evaluate((el) => el.parentElement.open))) await earlierScopes.click();
  await page
    .getByText(`Source version: ${fullVersion} · Revision: ${fullHead}`, { exact: true })
    .waitFor();
  await scope.fill("Retained scope belonging to a source with no stored identifiers.");
  version = "version-3";
  head = "content-3";
  tokenDigit = "e";
  await page.evaluate(() =>
    window.australianFixture.setDocument({
      versionId: "version-3",
      headCommitId: "content-3",
      text: "Fictional current source after identity comparison.",
      ready: true,
    })
  );
  await page.waitForFunction(
    () => document.querySelector("#review-scope-fictional-document")?.value === ""
  );
  await earlierScopes.waitFor();
  if (!(await earlierScopes.evaluate((el) => el.parentElement.open))) await earlierScopes.click();
  await page
    .getByText("Source version: No version ID · Revision: No commit ID", { exact: true })
    .waitFor();
  await scope.fill("Current scope retained while inspecting earlier source identities.");
  check(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "Full earlier-source identities must wrap at 390px"
  );
  await scope.focus();
  await page.screenshot({
    path: "output/playwright/design-workflows/au/review-earlier-identities-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("link", { name: "Leave fixture surface", exact: true }).click();
  await scopeExit.getByRole("button", { name: "Keep editing", exact: true }).click();
  check(
    (await scope.inputValue()) ===
      "Current scope retained while inspecting earlier source identities.",
    "Source identity inspection must retain the current draft through route Keep"
  );
  reviewStatus = 403;
  await page.evaluate(() => window.australianFixture.invalidate("document-review"));
  await scope.waitFor({ state: "hidden" });
  await page.getByText(/Could not load practitioner review/).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  check(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "Mobile AU fixture overflows the viewport"
  );
  check(unknown.length === 0, `Unexpected API calls: ${unknown.join(", ")}`);
  return {
    boundary:
      "Fictional HTTP and displayed-source readiness; actual production components and draft guards",
    guidedKeepAndFailureRecovery: true,
    guidedScopeDraftRetention: true,
    mobileGuidedKeepAndDiscard: true,
    preparedCallbackIdentity: true,
    zeroInferenceRequests: true,
    retainedSettingsSections: true,
    practiceRefetchAndSaveRecovery: true,
    pendingPreferenceProtection: true,
    practiceDenialRemovesForm: true,
    revisionKeyedReviewDrafts: true,
    unavailableSourceUnmountRetainsScope: true,
    blankPreviewBlocked: true,
    staleRecordReconfirmation: true,
    pendingRecordProtection: true,
    exactStateTokenPayload: true,
    reviewDenialRemovesPrivatePanel: true,
    fullEarlierSourceIdentities: true,
    nullEarlierSourceIdentitiesExplicit: true,
    earlierIdentityMobileAndDraftRecovery: true,
    mobileOverflow: false,
    apiCalls: calls.length,
    unhandledApiCalls: unknown.length,
  };
}
