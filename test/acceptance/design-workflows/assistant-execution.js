// oxlint-disable-next-line no-unused-vars -- Function entry point consumed by playwright-cli.
async function assistantExecution(page) {
  const assert = (value, message) => {
    if (!value) throw new Error(message);
  };

  const go = async (mode) => {
    await page.evaluate(() => window.assistantFixture.resetForNavigation());
    await page.goto(`http://127.0.0.1:4299/assistant?scenario=${mode}`);
  };
  const input = page.getByRole("textbox", { name: "Message for the assistant", exact: true });
  const count = () => page.evaluate(() => window.assistantFixture.requests.length);
  await go("unselected");
  await input.fill("Fictional request with no model selected");
  await input.press("Enter");
  assert((await count()) === 0, "Keyboard must not bypass missing model selection");
  assert(
    await page.getByRole("button", { name: "Send", exact: true }).isDisabled(),
    "Missing model must disable send"
  );
  await page.getByRole("button", { name: "Select model", exact: true }).click();
  await page.getByRole("button", { name: "Fictional model", exact: true }).click();
  await input.dispatchEvent("keydown", { key: "Enter", isComposing: true });
  assert((await count()) === 0, "IME confirmation must not submit");
  await input.press("Shift+Enter");
  assert(
    (await input.inputValue()).includes("\n"),
    "Shift+Enter must preserve multiline composition"
  );
  await go("no-model");
  await input.fill("Fictional unavailable-model request");
  await input.press("Enter");
  assert((await count()) === 0, "An unavailable remembered model cannot dispatch");
  assert(
    (await page
      .getByRole("link", { name: "Open model settings in another tab", exact: true })
      .getAttribute("target")) === "_blank",
    "Configuration can be opened without discarding the draft"
  );
  await go("catalog-error");
  await input.fill("Fictional draft retained during model configuration retry");
  await page.getByRole("button", { name: "Retry model access", exact: true }).waitFor();
  await page.evaluate(() => window.assistantFixture.setModelStatus(200));
  await page.getByRole("button", { name: "Retry model access", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('button[aria-label="Send"]').disabled);
  assert(
    (await input.inputValue()) === "Fictional draft retained during model configuration retry",
    "In-place configuration recovery must retain the draft"
  );
  for (const mode of ["processing", "failed-file"]) {
    await go(mode);
    await page.getByRole("button", { name: "Documents", exact: true }).click();
    await page.getByRole("button", { name: /^Fictional source\.txt/ }).click();
    await page.keyboard.press("Escape");
    await input.fill("Fictional question requiring the attached source");
    await input.press("Enter");
    assert((await count()) === 0, `${mode} attachment must block sending`);
    assert(
      await page.getByRole("button", { name: "Send", exact: true }).isDisabled(),
      `${mode} must visibly disable send`
    );
  }
  await go("workflow");
  await page.getByRole("region", { name: "Prepared workflow", exact: true }).waitFor();
  assert((await count()) === 0, "Opening a prepared workflow must not buy inference");
  await page.getByRole("button", { name: "Start workflow", exact: true }).click();
  await page.getByText("Fictional completed answer 3", { exact: true }).waitFor();
  const messages = await page.evaluate(() =>
    window.assistantFixture.requests.map((request) => request.message)
  );
  assert(
    messages.join("|") ===
      "First fictional workflow step|Second fictional workflow step|Third fictional workflow step",
    "Confirmed steps must dispatch once in order"
  );
  for (const mode of ["workflow-error", "workflow-stop"]) {
    await go(mode);
    await page.getByRole("button", { name: "Start workflow", exact: true }).click();
    await page.waitForFunction(() => window.assistantFixture.requests.length === 2);
    if (mode === "workflow-stop")
      await page.getByRole("button", { name: "Stop", exact: true }).click();
    await page.getByText(/^Workflow paused/).waitFor();
    await page
      .getByText(mode === "workflow-stop" ? "Response stopped" : "Response incomplete", {
        exact: true,
      })
      .waitFor();
    await page.waitForTimeout(200);
    assert((await count()) === 2, "Failure or stop must not dispatch the next workflow step");
    await page.getByText("Fictional partial answer", { exact: true }).waitFor();
  }
  for (const mode of ["stream-error", "truncated"]) {
    await go(mode);
    if (mode === "stream-error") {
      await page.getByRole("button", { name: "Documents", exact: true }).click();
      await page.getByRole("button", { name: /^Fictional source\.txt/ }).click();
      await page.keyboard.press("Escape");
    }
    await input.fill(`Fictional ${mode} request`);
    await input.press("Enter");
    await page.getByText("Response incomplete", { exact: true }).waitFor();
    await page.getByText("Fictional partial answer", { exact: true }).waitFor();
    if (mode === "stream-error")
      await page
        .getByRole("list", { name: "Request context", exact: true })
        .getByText("Attached document: Fictional source.txt", { exact: true })
        .waitFor();
    assert((await count()) === 1, "Incomplete transport must not retry automatically");
  }
  await go("followup-error");
  await input.fill("Fictional first saved request");
  await input.press("Enter");
  await page.getByRole("button", { name: "Stop", exact: true }).waitFor();
  await input.fill("Follow-up whose failure must remain visible");
  await page.evaluate(() => window.assistantFixture.finish());
  await page.getByText("Fictional completed answer 1", { exact: true }).waitFor();
  await input.press("Enter");
  await page.getByText("Response incomplete", { exact: true }).waitFor();
  await page.waitForTimeout(100);
  assert(
    await page.evaluate(() => window.assistantFixture.location() === "/assistant"),
    "A failed follow-up cannot trigger deferred navigation and discard its partial response"
  );
  await go("slow");
  await input.fill("Fictional first request");
  await input.press("Enter");
  await page.getByRole("button", { name: "Stop", exact: true }).waitFor();
  assert(
    await page.getByRole("button", { name: "Fictional model", exact: true }).isDisabled(),
    "Current request context stays stable while the response runs"
  );
  await input.fill("Unsent follow-up retained during completion");
  await page.evaluate(() => window.assistantFixture.finish());
  await page.getByText("Fictional completed answer 1", { exact: true }).waitFor();
  assert(
    (await input.inputValue()) === "Unsent follow-up retained during completion",
    "Completion navigation cannot discard a follow-up draft"
  );
  await page.getByRole("link", { name: "Leave workspace", exact: true }).click();
  const guard = page.getByRole("dialog", { name: "Keep your message draft?", exact: true });
  await guard.waitFor();
  await guard.getByRole("button", { name: "Keep editing", exact: true }).click();
  assert(
    (await input.inputValue()) === "Unsent follow-up retained during completion",
    "Cancelled navigation must preserve the draft"
  );
  await page.getByRole("link", { name: "Leave workspace", exact: true }).click();
  await guard.getByRole("button", { name: "Discard changes", exact: true }).click();
  await page.getByText("Fixture destination; no work was sent.", { exact: true }).waitFor();
  return {
    modelAndKeyboardGates: true,
    imeAndMultiline: true,
    processingAndFailedFilesBlocked: true,
    preparedWorkflowNoDispatch: true,
    orderedWorkflow: true,
    stopAndErrorPauseQueue: true,
    truncatedStreamIncomplete: true,
    noAutomaticRetry: true,
    modelSetupAndRetryRecovery: true,
    partialRetained: true,
    failedRequestContextRetained: true,
    followUpDraftRetained: true,
    failedFollowUpNotAutoNavigated: true,
    routeKeepAndDiscard: true,
    actualProviderCalls: 0,
  };
}
