import { chromium, webkit, type Page } from "playwright";
import { createRequire } from "node:module";
import { expect, it } from "vitest";
import { preferencesBrowser } from "./testing/preferences-server.ts";
import { installTourClock } from "./testing/change-clock.ts";
import { tourStart } from "./testing/change-tour.ts";

const require = createRequire(import.meta.url);
const readDay = async (page: Page, date: string, touch: boolean) => {
  const cell = page.locator(`.graph-surface rect[data-date="${date}"]`);
  await cell.scrollIntoViewIfNeeded();
  const box = await cell.boundingBox();
  const point = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
  if (touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.move(point.x, point.y);
};

it.each([chromium, webkit])(
  "%s contribution surface reflows, scrolls at today, selects by pointer and keyboard, and restores its metric",
  async (browser) => {
    await using f = await preferencesBrowser(browser, {
      hasTouch: true,
      timezoneId: "UTC",
      locale: "en-GB",
      viewport: { width: 1280, height: 720 },
    });
    f.server.writer.session("ses-contributions");
    for (const day of [1, 2, 3, 4, 5, 6, 7])
      f.server.writer.message({
        id: `msg-contributions-${day}`,
        session: "ses-contributions",
        seq: day,
        start: Date.UTC(2026, 9, day, 12),
        tokens: { input: day * 100 },
      });
    await installTourClock(f.context, tourStart);
    const page = await f.context.newPage();
    await page.goto(`${f.server.origin}/?range=today&graph=steps`);
    const surface = page.getByRole("img", { name: "Contribution graph, past 365 local days" });
    await surface.waitFor();
    await page.waitForFunction(
      () =>
        document.querySelector('[aria-labelledby="active-days"] .headline-number')?.textContent ===
        "1",
    );
    const metric = page.getByRole("group", { name: "Contribution metric" });
    expect(
      await metric.getByRole("button", { name: "Steps", exact: true }).getAttribute("aria-pressed"),
    ).toBe("true");
    await surface.scrollIntoViewIfNeeded();
    const scroll = page.locator(".graph-scroll");
    expect(await scroll.evaluate((node) => node.scrollLeft)).toBe(0);
    await page.setViewportSize({ width: 360, height: 720 });
    await page.waitForFunction(
      () => document.querySelector(".contribution-graph")?.getAttribute("data-narrow") === "true",
    );
    expect(
      await page
        .locator(".graph-scroll")
        .evaluate(
          (node) =>
            node.scrollLeft > 0 && node.scrollLeft + node.clientWidth >= node.scrollWidth - 1,
        ),
    ).toBe(true);
    const days = page.locator(".graph-surface rect[data-date]");
    expect(await days.count()).toBe(365);
    await readDay(page, "2026-10-07", true);
    expect(new URL(page.url()).searchParams.get("range")).toBe("today");
    await page.getByRole("button", { name: "Week 41", exact: true }).tap();
    await page.waitForURL(/kind=week/);
    expect(new URL(page.url()).searchParams.get("from")).toBe("2026-10-05");
    expect(new URL(page.url()).searchParams.get("to")).toBe("2026-10-11");
    await surface.focus();
    const focused = await surface.evaluate((node) => node === document.activeElement);
    await surface.press("ArrowUp");
    await surface.press("Enter");
    await page.waitForURL(/kind=day/);
    expect(new URL(page.url()).searchParams.get("from")).toBe("2026-10-06");
    const beforeTab = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 512));
    await page.keyboard.press("Tab");
    expect(
      await page
        .getByRole("button", { name: "This day", exact: true })
        .evaluate((node) => node === document.activeElement),
      `[DEBUG-graph-focus] ${JSON.stringify({
        focused,
        beforeTab,
        afterTab: await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 512)),
      })}`,
    ).toBe(true);
    await page.getByRole("button", { name: "October", exact: true }).tap();
    await page.waitForURL(/kind=month/);
    await metric.getByRole("button", { name: "≈ Estimated cost", exact: true }).tap();
    await page.waitForURL(/graph=cost/);
    expect(await page.locator(".graph-readout").textContent()).toContain(
      "Unavailable estimated cost",
    );
    await page.reload();
    await surface.waitFor();
    expect(
      await metric
        .getByRole("button", { name: "≈ Estimated cost", exact: true })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    await metric.getByRole("button", { name: "Tokens", exact: true }).tap();
    await page.waitForURL((url) => !url.searchParams.has("graph"));
    await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    for (const width of [320, 360, 768, 1280]) {
      await page.setViewportSize({ width, height: 720 });
      await surface.scrollIntoViewIfNeeded();
      await readDay(page, "2026-10-07", false);
      expect(await page.locator(".graph-readout").textContent()).toContain("7 Oct 2026");
      const a11y = await page.evaluate(() => window.axe.run());
      expect(a11y.violations).toEqual([]);
      expect(a11y.incomplete).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const sizes = await page
        .locator(".graph-metrics button, .graph-actions button")
        .evaluateAll((nodes) =>
          nodes.map((node) => ({
            width: node.getBoundingClientRect().width,
            height: node.getBoundingClientRect().height,
          })),
        );
      expect(sizes.every((size) => size.width >= 44 && size.height >= 44)).toBe(true);
      expect(
        await page
          .locator(".graph-streaks")
          .evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length),
      ).toBe(3);
    }
    await surface.focus();
    await surface.press("Home");
    await page.keyboard.press("Tab");
    const action = page.getByRole("button", { name: "This day", exact: true });
    await page.setViewportSize({ width: 360, height: 720 });
    await page.waitForFunction(
      () => document.querySelector(".contribution-graph")?.getAttribute("data-narrow") === "true",
    );
    expect(await action.evaluate((node) => node === document.activeElement)).toBe(true);
    expect(await page.locator(".graph-readout").textContent()).toContain("8 Oct 2025");
    const first = await page.locator('.graph-surface rect[data-reading="true"]').boundingBox();
    const viewport = await scroll.boundingBox();
    expect(first!.x).toBeGreaterThanOrEqual(viewport!.x);
    expect(first!.x + first!.width).toBeLessThanOrEqual(viewport!.x + viewport!.width);
    await scroll.evaluate((node) => {
      node.scrollLeft = 100;
    });
    const local = await surface.getAttribute("data-local-state");
    await page.setViewportSize({ width: 320, height: 720 });
    await page.waitForFunction(
      (before) =>
        document.querySelector(".graph-surface")?.getAttribute("data-local-state") !== before,
      local,
    );
    expect(await scroll.evaluate((node) => node.scrollLeft)).toBe(100);
    expect(await action.evaluate((node) => node === document.activeElement)).toBe(true);
    expect(await page.locator(".graph-readout").textContent()).toContain("8 Oct 2025");
    // The same touch-capable machine still gets immediate mouse selections.
    const cell = page.locator('.graph-surface rect[data-date="2026-10-06"]');
    await cell.click();
    await page.waitForURL(/kind=day/);
    expect(new URL(page.url()).searchParams.get("from")).toBe("2026-10-06");
  },
);
