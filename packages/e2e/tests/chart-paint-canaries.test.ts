import { chromium, webkit } from "playwright";
import { expect, it } from "vitest";
import { preferencesBrowser } from "./testing/preferences-server.ts";
import { installTourClock } from "./testing/change-clock.ts";
import { tourStart } from "./testing/change-tour.ts";
import { installWholePaintObserver, paintEvidence, wholeChange } from "./testing/whole-paint.ts";

it.each([chromium, webkit])(
  "%s rejects unmarked SVG, highlight, cursor, local-readout and geometry changes",
  async (browser) => {
    await using f = await preferencesBrowser(browser, { timezoneId: "UTC", locale: "en-GB" });
    f.server.writer.session("ses-chart-canary");
    f.server.writer.message({
      id: "msg-chart-canary",
      session: "ses-chart-canary",
      seq: 0,
      start: tourStart - 60000,
      tokens: { input: 300 },
    });
    await installTourClock(f.context, tourStart);
    await f.context.addInitScript(installWholePaintObserver);
    const page = await f.context.newPage();
    await page.goto(`${f.server.origin}/?range=7d`);
    for (const change of ["svg", "highlight", "cursor", "readout", "size"] as const) {
      await page.waitForFunction(() => window.wholePaint.evidence.complete > 0);
      await wholeChange(page, "chart-read", () => page.locator(".chart-hit").press("Home"));
      await paintEvidence(page);
      await page.evaluate((kind) => {
        const chart = document.querySelector(".chart-hit")!;
        const svg = chart.querySelector("svg")!;
        if (kind === "svg") svg.setAttribute("viewBox", "0 0 1 1");
        else if (kind === "highlight")
          document.querySelector(".chart-readout li button")!.setAttribute("aria-pressed", "true");
        else if (kind === "cursor")
          document.querySelector<HTMLElement>(".chart-cursor")!.style.left = "0px";
        else if (kind === "readout")
          document
            .querySelector(".chart-readout")!
            .setAttribute("data-local-state", "planted-wrong");
        else svg.setAttribute("data-size-state", "planted-wrong");
      }, change);
      await page.waitForFunction(() => window.wholePaint.evidence.failures.includes("mixed-frame"));
      await expect(paintEvidence(page)).rejects.toThrow("whole-paint:mixed-frame");
      await page.reload();
    }
    await page.waitForFunction(() => window.wholePaint.evidence.complete > 0);
    await wholeChange(page, "chart-menu", () =>
      page.getByRole("button", { name: /^Chart metric/ }).click(),
    );
    await wholeChange(page, "chart-metric", () =>
      page.getByRole("option", { name: "≈ Estimated cost", exact: true }).click(),
    );
    await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    const axe = await page.evaluate(() => window.axe.run());
    expect(axe.violations).toEqual([]);
    expect(axe.incomplete).toEqual([]);
  },
);
