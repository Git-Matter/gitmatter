// oxlint-disable-next-line no-unused-vars -- Function entry point consumed by playwright-cli.
async function vaultScreenshots(page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(
    "http://127.0.0.1:4286/reviews/10000000-0000-4000-8000-000000000002?preview=vault&model=claude-sonnet-5"
  );
  const table = page.getByRole("region", { name: "Review table", exact: true });
  await table.getByRole("button", { name: /Review 14/ }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: "output/playwright/vault-review-table.png",
    animations: "disabled",
  });
  await table
    .getByRole("button", { name: /^Five-year term/ })
    .first()
    .click();
  await page.getByRole("complementary", { name: "Confidentiality term", exact: true }).waitFor();
  await page.screenshot({
    path: "output/playwright/vault-review-inspector.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const inspector = page.getByRole("dialog", { name: "Confidentiality term", exact: true });
  await inspector.waitFor();
  await page.screenshot({
    path: "output/playwright/vault-review-mobile.png",
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await inspector.waitFor({ state: "hidden" });
  for (const name of ["Run", "Export"]) {
    const box = await page.getByRole("button", { name, exact: true }).boundingBox();
    if (!box || box.x < 0 || box.x + box.width > 390)
      throw new Error(`${name} is clipped on mobile`);
  }
  await table.locator('[data-slot="table-container"]').evaluate((element) => {
    element.parentElement.scrollLeft = 0;
  });
  const contained = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  if (!contained) throw new Error("Review preview overflows the mobile page");
  await page.screenshot({
    path: "output/playwright/vault-review-table-mobile.png",
    animations: "disabled",
  });
  return {
    captures: 4,
    productionComponents: true,
    fictionalReadOnlyCopies: 14,
    containedMobilePage: true,
  };
}
