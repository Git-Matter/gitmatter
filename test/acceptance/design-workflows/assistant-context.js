// oxlint-disable-next-line no-unused-vars -- Function entry point consumed by playwright-cli.
async function assistantContext(page) {
  const assert = (value, message) => {
    if (!value) throw new Error(message);
  };
  const chat = "10000000-0000-4000-8000-000000000003";
  const matter = "10000000-0000-4000-8000-000000000001";

  const go = async (path, mode) => {
    await page.evaluate(() => window.assistantFixture.resetForNavigation());
    await page.goto(`http://127.0.0.1:4299${path}?scenario=${mode}`);
  };
  const input = page.getByRole("textbox", { name: "Message for the assistant", exact: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await go(`/assistant/${chat}`, "resume-error");
  await page.getByText("Conversation unavailable", { exact: true }).waitFor();
  assert(
    (await input.count()) === 0,
    "A failed saved chat cannot become a new writable conversation"
  );
  await page.evaluate(() => window.assistantFixture.setResumeStatus(200));
  await page.getByRole("button", { name: "Retry conversation", exact: true }).click();
  await page.getByText("Saved fictional answer", { exact: true }).waitFor();
  await page.getByRole("link", { name: "Leave workspace", exact: true }).click();
  await page.evaluate(() =>
    window.assistantFixture.appendSavedTurn("Fictional saved update while away")
  );
  await page.getByRole("link", { name: "Saved conversation", exact: true }).click();
  await page.getByText("Fictional saved update while away", { exact: true }).waitFor();
  await input.fill("Fictional resumed question");
  await input.press("Enter");
  await page.getByText("Fictional completed answer 1", { exact: true }).waitFor();
  assert(
    await page.evaluate(
      (expected) => window.assistantFixture.requests[0].chatId === expected,
      chat
    ),
    "A resumed send must use the saved conversation identity"
  );
  await input.fill("Fictional saved-conversation draft");
  await page.evaluate(() => window.assistantFixture.resumeStatus(503));
  await page.getByText("Conversation could not be refreshed", { exact: true }).waitFor();
  assert(
    (await input.inputValue()) === "Fictional saved-conversation draft",
    "Transient refresh cannot unmount the draft"
  );
  await input.press("Enter");
  assert(
    (await page.evaluate(() => window.assistantFixture.requests.length)) === 1,
    "Cached failed-refresh state cannot authorize dispatch"
  );
  await page.evaluate(() => window.assistantFixture.setResumeStatus(200));
  await page.getByRole("button", { name: "Retry conversation refresh", exact: true }).click();
  await page
    .getByText("Conversation could not be refreshed", { exact: true })
    .waitFor({ state: "hidden" });
  assert(
    (await input.inputValue()) === "Fictional saved-conversation draft",
    "Recovery must preserve the draft"
  );
  await page.evaluate(() => window.assistantFixture.resumeStatus(403));
  await page.getByText("Conversation unavailable", { exact: true }).waitFor();
  assert(
    (await input.count()) === 0 &&
      (await page.getByText("Saved fictional answer", { exact: true }).count()) === 0,
    "Denial must remove cached private conversation content"
  );
  await go(`/assistant/${chat}`, "legacy");
  await page.getByText("Earlier tool call records", { exact: true }).click();
  await page
    .getByText(
      "These records contain call inputs. Their outcomes were not stored in this conversation history.",
      { exact: true }
    )
    .waitFor();
  assert(
    (await page.getByRole("button", { name: /^Recorded activity/ }).count()) === 0,
    "Earlier call inputs cannot fabricate a completed activity timeline"
  );
  await go(`/matters/${matter}/assistant/${chat}`, "mismatch");
  await page
    .getByText("This conversation belongs to a different context", { exact: true })
    .waitFor();
  assert((await input.count()) === 0, "A mismatched matter must not acquire the conversation");
  await go(`/assistant/${chat}`, "matter-redirect");
  await page.waitForFunction(
    (id) => window.assistantFixture.location().includes(`/matters/${id}/assistant/`),
    matter
  );
  await page.getByText("Fictional matter", { exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  const crumbBounds = await page
    .getByRole("heading", { level: 1 })
    .first()
    .locator("a, span.truncate")
    .evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return { x: box.x, right: box.right };
      })
    );
  assert(
    crumbBounds.every((box, index) => index === 0 || box.x >= crumbBounds[index - 1].right - 1),
    "Mobile breadcrumb labels must not overlap"
  );
  await input.fill("Fictional source question kept across panes");
  await page.getByRole("button", { name: "Files", exact: true }).click();
  await page.getByText("Fictional source.txt", { exact: true }).click();
  const document = page.getByRole("region", { name: "Document workspace", exact: true });
  await document
    .getByText("Fictional source text retained for source inspection.", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Conversation", exact: true }).click();
  assert(
    (await input.inputValue()) === "Fictional source question kept across panes",
    "Pane inspection cannot discard the message draft"
  );
  await page.getByText("Current document: Fictional source.txt", { exact: true }).waitFor();
  const bounds = await input.boundingBox();
  assert(
    bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390,
    "Mobile composer must be reachable inside the viewport"
  );
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "Matter workspace must not overflow horizontally"
  );
  await page.screenshot({
    path: "output/playwright/design-workflows/assistant-matter-mobile.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const divider = page.getByRole("separator", { name: "Resize files pane", exact: true });
  await divider.focus();
  const width = Number(await divider.getAttribute("aria-valuenow"));
  await divider.press("ArrowLeft");
  assert(
    Number(await divider.getAttribute("aria-valuenow")) <= width,
    "Keyboard resizing must adjust the files pane"
  );
  await input.press("Enter");
  await page.getByText("Fictional completed answer 1", { exact: true }).waitFor();
  assert(
    await page.evaluate(
      (expected) =>
        window.assistantFixture.requests[0].activeDocumentId === expected &&
        window.assistantFixture.requests[0].chatId === "10000000-0000-4000-8000-000000000003",
      "10000000-0000-4000-8000-000000000002"
    ),
    "The sent request must carry the inspected document and saved conversation identities"
  );
  await go(`/matters/${matter}/assistant`, "viewer");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Attach files and context", exact: true }).click();
  assert(
    (await page.getByRole("button", { name: "Upload a file", exact: true }).count()) === 0,
    "Reader cannot get a matter upload action"
  );
  await page.keyboard.press("Escape");
  await go("/assistant", "activity");
  await input.fill("Fictional activity inspection request");
  await input.press("Enter");
  const activity = page.getByRole("button", { name: /^Recorded activity/ });
  await activity.waitFor();
  await activity.click();
  const dialog = page.getByRole("dialog", { name: "Activity", exact: true });
  await dialog.waitFor();
  assert(
    await dialog.evaluate((el) => el.getBoundingClientRect().width <= innerWidth),
    "Activity must fit mobile instead of pushing the composer off-screen"
  );
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await page.waitForFunction(() =>
    document.activeElement?.textContent?.startsWith("Recorded activity")
  );
  assert(
    await activity.evaluate((el) => el === document.activeElement),
    "Closing activity must return focus to its opener"
  );
  return {
    savedFailureNotNewChat: true,
    retryRestoredSavedContext: true,
    returnLoadsCurrentServerHistory: true,
    resumedSendUsesSavedIdentity: true,
    transientDraftRetainedAndBlocked: true,
    denialClearedPrivateView: true,
    earlierOutcomesNotInvented: true,
    matterIdentityChecked: true,
    matterRedirect: true,
    mobilePaneRoundTrip: true,
    sourceContextVisible: true,
    dispatchedSourceIdentityMatchesView: true,
    mobileComposerReachable: true,
    mobileBreadcrumbsReadable: true,
    keyboardResize: true,
    readerUploadAbsent: true,
    activityMobileAndFocusReturn: true,
    actualProviderCalls: 0,
  };
}
