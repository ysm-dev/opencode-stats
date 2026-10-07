import { chromium, webkit } from "playwright";
import { expect, it } from "vitest";
import { preferencesBrowser } from "./testing/preferences-server.ts";
import { installTourClock } from "./testing/change-clock.ts";
import { tourStart } from "./testing/change-tour.ts";
import { assertPaintCheck, installWholePaintObserver } from "./testing/whole-paint.ts";

it.each([chromium, webkit])(
  "%s rejects unmarked graph geometry, selection and readout drawings",
  async (browser) => {
    await using f = await preferencesBrowser(browser, { timezoneId: "UTC", locale: "en-GB" });
    await installTourClock(f.context, tourStart);
    await f.context.addInitScript(installWholePaintObserver);
    const page = await f.context.newPage();
    for (const drawing of ["geometry", "selection", "readout"] as const) {
      await page.goto(`${f.server.origin}/?range=all`);
      await page.waitForFunction(() => window.wholePaint.evidence.complete > 1);
      expect(await page.evaluate(() => window.wholePaint.evidence.failures)).toEqual([]);
      await page.evaluate((kind) => {
        const cell = document.querySelector('.graph-surface rect[data-date="2026-10-07"]')!;
        if (kind === "geometry") cell.setAttribute("x", "-100");
        else if (kind === "selection")
          cell.setAttribute("data-selected", String(cell.getAttribute("data-selected") !== "true"));
        else
          document.querySelector(".graph-readout")!.textContent = "Planted partial graph readout";
      }, drawing);
      await page.waitForFunction(() => window.wholePaint.evidence.failures.includes("mixed-frame"));
      const failures = await page.evaluate(() => window.wholePaint.evidence.failures);
      expect(() => assertPaintCheck("mixed-frame", failures)).toThrow("whole-paint:mixed-frame");
    }
  },
);
