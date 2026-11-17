// oxlint-disable-next-line no-unused-vars -- Function entry point consumed by playwright-cli.
async function reviewInspector(page) {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  // Close an inspector left open by an earlier exploratory pass.
  while (await page.getByRole("dialog").count()) await page.keyboard.press("Escape");
  const results = [];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const scenario of ["partial", "stale"]) {
      await page.getByRole("combobox", { name: /^Scenario/ }).selectOption(scenario);
      await page.getByRole("button", { name: "Finding inspector", exact: true }).click();
      const opener = page.getByRole("button", { name: "Inspect first finding", exact: true });
      await opener.click();
      const inspector = page.getByRole("dialog", { name: "Permitted use", exact: true });
      await inspector.waitFor();
      assert(await inspector.getAttribute("aria-describedby"), "Inspector needs a description");
      assert(
        await inspector.getByRole("button", { name: "Re-run", exact: true }).isDisabled(),
        "Read-only inspector must not run a rule"
      );
      const reviewed = inspector.getByRole("link", {
        name: "Download the reviewed source version",
        exact: true,
      });
      assert(
        (await reviewed.getAttribute("href")).includes("/versions/"),
        "Reviewed download must identify the captured version"
      );
      const source = inspector.getByRole("button", {
        name: scenario === "stale" ? /Open current draft$/ : /Open source$/,
      });
      await source.click();
      const preview = page.getByRole("dialog", { name: "Synthetic mutual NDA.docx", exact: true });
      await preview.waitFor();
      assert(
        await preview.getAttribute("aria-describedby"),
        "Document preview needs source context"
      );
      assert(
        await preview.evaluate((el) => el.getBoundingClientRect().width <= innerWidth),
        "Preview must fit the viewport"
      );
      await preview.getByRole("button", { name: "Close", exact: true }).click();
      await preview.waitFor({ state: "hidden" });
      await page.waitForFunction(
        () =>
          document.activeElement?.textContent?.includes("Open source") ||
          document.activeElement?.textContent?.includes("Open current draft")
      );
      assert(
        await source.evaluate((el) => el === document.activeElement),
        "Closing source must return to its quotation"
      );
      await page.screenshot({
        path: `output/playwright/design-workflows/inspector-${scenario}-${width}.png`,
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await inspector.waitFor({ state: "hidden" });
      await page.waitForFunction(
        () => document.activeElement?.textContent === "Inspect first finding"
      );
      assert(
        await opener.evaluate((el) => el === document.activeElement),
        "Escape must return to the finding opener"
      );
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        "Inspector must not create page overflow"
      );
      results.push({
        width,
        scenario,
        namedDialogs: true,
        reviewedVersionLink: true,
        sourceReturnFocus: true,
        escapeReturnFocus: true,
        overflow: false,
      });
    }
  }
  return { cases: results, providerCalls: 0 };
}
