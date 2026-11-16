// oxlint-disable-next-line no-unused-vars -- Entry point consumed by playwright-cli.
async function appWide(page) {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const results = [];
  const fixtureOrigin = page.url().split("/").slice(0, 3).join("/");
  await page.evaluate(() => window.appFixture?.resetForNavigation());
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [route, title, probe] of [
    ["clients", "Clients", "Northstar Studio"],
    ["matters", "Matters", "Commercial services agreement"],
    ["documents", "Documents", "Services agreement.docx"],
    ["workflows", "Workflows", "Contract summary"],
    ["library", "Library", "Confidentiality — mutual"],
    ["reviews", "Reviews", "Review — Commercial services agreement"],
  ]) {
    await page.goto(`${fixtureOrigin}/${route}`);
    await page.getByRole("heading", { name: title, exact: true, level: 1 }).waitFor();
    if (route === "library")
      await page.getByRole("button", { name: "Clauses", exact: true }).click();
    await page.getByRole("main").getByText(probe, { exact: false }).first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    check(
      (await page.locator('[data-slot="sidebar"]').count()) > 0,
      "All screens must use the shared Sidebar"
    );
    const search = page.getByRole("main").getByRole("textbox").first();
    if (await search.count()) {
      const sidebarState = await page
        .locator('[data-slot="sidebar"][data-state]')
        .getAttribute("data-state");
      await search.focus();
      await page.keyboard.press("Meta+b");
      check(
        (await page.locator('[data-slot="sidebar"][data-state]').getAttribute("data-state")) ===
          sidebarState,
        "Typing shortcuts must not collapse navigation"
      );
      await search.fill("No fictional record matches this");
      await page.waitForTimeout(650);
      await search.fill("");
      await page.getByRole("main").getByText(probe, { exact: false }).first().waitFor();
    }
    const selectAll = page.getByRole("checkbox", {
      name: "Select all rows on this page",
      exact: true,
    });
    if (await selectAll.count()) {
      await selectAll.check();
      const selected = page.getByRole("checkbox", { name: "Select row", exact: true });
      if (await selected.count())
        check(await selected.first().isChecked(), "Table select-all must update row selection");
      await selectAll.uncheck();
      if (await selected.count())
        check(!(await selected.first().isChecked()), "Clearing selection must update rows");
    }
    if (route === "workflows") {
      await page.getByRole("button", { name: "Custom", exact: true }).click();
      await page.getByRole("main").getByText("Prepare a chronology", { exact: true }).waitFor();
      await page.getByRole("button", { name: "All", exact: true }).click();
      await page.getByRole("main").getByText("Contract summary", { exact: true }).waitFor();
    }
    await page.screenshot({
      path: `output/playwright/app-${route}-desktop.png`,
      animations: "disabled",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    check(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `${title} must not overflow the mobile page`
    );
    const pager = page.getByRole("navigation", { name: "Table pagination", exact: true });
    if (await pager.count()) {
      const box = await pager.boundingBox();
      check(
        box && box.y + box.height <= 844,
        `${title} pagination must remain inside the viewport`
      );
    }
    await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
    const navigation = page.getByRole("dialog", { name: "Workspace navigation", exact: true });
    await navigation.waitFor();
    await page.keyboard.press("Escape");
    await navigation.waitFor({ state: "hidden" });
    check(
      await page
        .getByRole("button", { name: "Expand sidebar", exact: true })
        .evaluate((el) => el === document.activeElement),
      "Mobile navigation must return focus"
    );
    await page.screenshot({
      path: `output/playwright/app-${route}-mobile.png`,
      animations: "disabled",
    });
    results.push({ route, searchAndReturn: true, mobileNavigation: true, containedMobile: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  return {
    scope:
      "Production components in an isolated read-only fictional UI fixture; no live auth, providers or legal quality claim",
    screens: results,
    captures: 12,
  };
}
