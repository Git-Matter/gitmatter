// oxlint-disable-next-line no-unused-vars -- Function entry point consumed by playwright-cli.
async function templateUnsaved(page) {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const editor = page.getByRole("dialog", { name: "New template", exact: true });
  if (!(await editor.isVisible()))
    await page.getByRole("button", { name: "Template draft", exact: true }).click();
  await editor.waitFor();
  const unloadPrevented = () =>
    page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
  assert(
    (await unloadPrevented()) === false,
    "An untouched editor must not warn about unsaved changes"
  );
  const name = editor.getByRole("textbox", { name: "Template name", exact: true });
  await name.fill("Fictional retained NDA");
  await page.waitForFunction(
    () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    },
    null,
    { timeout: 3000 }
  );
  await page.keyboard.press("Escape");
  const confirm = page.getByRole("dialog", { name: "Keep your unsaved revision?", exact: true });
  await confirm.waitFor();
  await confirm.getByRole("button", { name: "Keep editing", exact: true }).click();
  await confirm.waitFor({ state: "hidden" });
  assert(
    (await name.inputValue()) === "Fictional retained NDA",
    "Shared guard must retain template edits after Escape/Keep"
  );
  await page.keyboard.press("Escape");
  await confirm.waitFor();
  await page.screenshot({
    animations: "disabled",
    path: "output/playwright/design-workflows/template-unsaved-confirmation.png",
  });
  await confirm.getByRole("button", { name: "Discard changes", exact: true }).click();
  await editor.waitFor({ state: "hidden" });
  assert(
    (await unloadPrevented()) === false,
    "Closing the editor must remove its native unload guard"
  );
  await page.getByRole("button", { name: "Template draft", exact: true }).click();
  await editor.waitFor();
  assert(
    (await editor.getByRole("textbox", { name: "Template name", exact: true }).inputValue()) === "",
    "Explicit discard must create a fresh editor on reopen"
  );
  await editor.getByRole("button", { name: "Close", exact: true }).click();
  await editor.waitFor({ state: "hidden" });
  return {
    scope: "unsaved template UI only; mutations blocked",
    programmaticDialogName: true,
    nativeUnloadSignal: true,
    keepRetains: true,
    discardCloses: true,
    guardCleanup: true,
    reopenFresh: true,
  };
}
