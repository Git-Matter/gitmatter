// oxlint-disable-next-line no-unused-vars -- Entry point consumed by playwright-cli.
async function assistantScreenshots(page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(
    "http://127.0.0.1:4280/matters/10000000-0000-4000-8000-000000000001/assistant/10000000-0000-4000-8000-000000000003?preview=1"
  );
  await page.getByRole("textbox", { name: "Message for the assistant", exact: true }).waitFor();
  await page.getByText("Fictional source.txt", { exact: true }).click();
  await page
    .getByRole("region", { name: "Document workspace", exact: true })
    .getByText("Fictional source text retained for source inspection.", { exact: true })
    .waitFor();
  await page.getByText("Saved fictional answer", { exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: "output/playwright/app-assistant-desktop.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Conversation", exact: true }).click();
  const box = await page
    .getByRole("textbox", { name: "Message for the assistant", exact: true })
    .boundingBox();
  if (!box || box.x < 0 || box.x + box.width > 390) throw new Error("Mobile composer is clipped");
  await page.screenshot({
    path: "output/playwright/app-assistant-mobile.png",
    animations: "disabled",
  });
  return { captures: 2, actualProviderCalls: 0, fictionalSavedConversation: true };
}
