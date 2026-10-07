import { createRequire } from "node:module";
import { chromium, webkit } from "playwright";
import { expect, it } from "vitest";
import { preferencesBrowser } from "./testing/preferences-server.ts";
import { installTourClock } from "./testing/change-clock.ts";
import { tourStart } from "./testing/change-tour.ts";

const require = createRequire(import.meta.url);

it.each([chromium, webkit])(
  "%s checks visible contribution labels against opaque HTML surfaces, including a planted contrast failure",
  async (browser) => {
    await using f = await preferencesBrowser(browser, { timezoneId: "UTC", locale: "en-GB" });
    await installTourClock(f.context, tourStart);
    const page = await f.context.newPage();
    await page.goto(`${f.server.origin}/?range=all`);
    await page.getByRole("img", { name: "Contribution graph, past 365 local days" }).waitFor();
    await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    for (const width of [360, 1280]) {
      await page.setViewportSize({ width, height: 720 });
      await page.locator(".graph-calendar").scrollIntoViewIfNeeded();
      const result = await page.evaluate(() =>
        window.axe.run(".contribution-graph", { runOnly: ["color-contrast"] }),
      );
      expect(result.violations).toEqual([]);
      expect(result.incomplete).toEqual([]);
      const checked = result.passes.flatMap((rule) => rule.nodes);
      expect(checked.some((node) => node.html.includes("data-month="))).toBe(true);
      expect(checked.some((node) => node.html.includes("data-week="))).toBe(true);
      expect(checked.some((node) => JSON.stringify(node.target).includes("graph-weekdays"))).toBe(
        true,
      );
      expect(
        await page.locator(".graph-label, .graph-weekdays span").evaluateAll((nodes) =>
          nodes.every((node) => {
            const style = getComputedStyle(node);
            return (
              node instanceof HTMLSpanElement &&
              style.backgroundColor ===
                getComputedStyle(document.querySelector("main")!).backgroundColor
            );
          }),
        ),
      ).toBe(true);
    }
    await page
      .locator(".graph-label[data-month]")
      .first()
      .evaluate((node) => {
        // Exactly 1:1 is axe's equalRatio incomplete case, not a violation.
        node.style.backgroundColor = "rgb(255, 255, 255)";
        node.style.color = "rgb(238, 238, 238)";
      });
    const planted = await page.evaluate(() =>
      window.axe.run(".contribution-graph", { runOnly: ["color-contrast"] }),
    );
    expect(planted.violations.map((rule) => rule.id)).toContain("color-contrast");
    expect(planted.incomplete).toEqual([]);
  },
);
