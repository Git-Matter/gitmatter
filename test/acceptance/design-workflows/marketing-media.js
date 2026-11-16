// oxlint-disable-next-line no-unused-vars -- Function entry point consumed by playwright-cli.
async function marketingMedia(page) {
  const paths = [
    "/",
    "/platform",
    "/platform/assistant",
    "/resources/product-tour",
    "/blog/ai-audit-trail-legal-work",
  ];
  const results = [];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const path of paths) {
      await page.goto(`http://127.0.0.1:4280${path}`);
      await page.locator('figure[data-media-origin="illustration"] video').first().waitFor();
      const state = await page.locator("video").evaluateAll((videos) =>
        videos.map((video) => {
          const figure = video.closest("figure");
          const description = document.getElementById(video.getAttribute("aria-describedby"));
          return {
            paused: video.paused,
            controls: video.controls,
            autoplay: video.autoplay,
            loop: video.loop,
            origin: figure?.getAttribute("data-media-origin"),
            caption: description?.textContent,
            label: video.getAttribute("aria-label"),
          };
        })
      );
      if (
        !state.length ||
        state.some(
          (video) =>
            !video.paused ||
            !video.controls ||
            video.autoplay ||
            video.loop ||
            video.origin !== "illustration" ||
            !video.caption?.includes("Illustrative preview using example data.") ||
            !video.label
        )
      )
        throw new Error(
          `Uncontrolled or undisclosed product media on ${path}: ${JSON.stringify(state)}`
        );
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw new Error(`Page overflow: ${path} at ${width}`);
      if (path === "/")
        await page
          .locator('figure[data-media-origin="illustration"]')
          .first()
          .screenshot({
            path: `output/playwright/design-workflows/media-disclosure-${width}.png`,
            animations: "disabled",
          });
      results.push({
        path,
        width,
        players: state.length,
        paused: true,
        controls: true,
        labelled: true,
        originDisclosed: true,
        overflow: false,
      });
    }
  }
  return {
    cases: results,
    scope:
      "Current public pages, rendered illustration disclosure and playback behavior; no live product capability or privacy-policy proof",
  };
}
