import { createRequire } from "node:module";
import { chromium, webkit } from "playwright";
import { expect, it } from "vitest";
import { preferencesBrowser } from "./testing/preferences-server.ts";
import { installTourClock } from "./testing/change-clock.ts";
import { tourStart } from "./testing/change-tour.ts";
import { installWholePaintObserver, paintEvidence, wholeChange } from "./testing/whole-paint.ts";

const require = createRequire(import.meta.url);

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
    await page.waitForFunction(() => window.wholePaint.evidence.complete > 0);
    const geometry = await page.evaluate(() => {
      const chart = document.querySelector(".usage-chart")!;
      const surface = chart.querySelector(".chart-hit")!;
      const plot = surface.querySelector("svg")!;
      const icon = chart.querySelector(".chart-choices svg")!;
      return {
        firstIsIcon: chart.querySelector("svg") === icon,
        iconIsPlot: icon === plot,
        iconSize: icon.getAttribute("data-size-state"),
        plotMatches:
          plot.hasAttribute("data-size-state") &&
          plot.getAttribute("data-size-state") === surface.getAttribute("data-size-state"),
      };
    });
    expect(geometry).toEqual({
      firstIsIcon: true,
      iconIsPlot: false,
      iconSize: null,
      plotMatches: true,
    });
    await paintEvidence(page);
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
      const causes = await page.evaluate(() => window.wholePaint.evidence.causes);
      const cause = {
        svg: "stable-drawing:svg",
        highlight: "stable-drawing:.chart-readout",
        cursor: "stable-drawing:.chart-hit",
        readout: "chart-local-marks:.chart-readout",
        size: "chart-size-marks",
      }[change];
      expect(causes).toContain(cause);
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
    if (axe.incomplete.length) {
      const bounds = await page.locator(".chart-y-axis").evaluate((axis) => ({
        axis: axis.getBoundingClientRect().toJSON(),
        labels: [...axis.children].map((label) => {
          const text = document.createRange();
          text.selectNodeContents(label);
          return {
            text: label.textContent,
            box: label.getBoundingClientRect().toJSON(),
            glyphs: text.getBoundingClientRect().toJSON(),
            lineHeight: getComputedStyle(label).lineHeight,
          };
        }),
      }));
      process.stderr.write(`[DEBUG-axis-contained] ${JSON.stringify(bounds)}\n`);
    }
    expect(axe.violations).toEqual([]);
    expect(axe.incomplete).toEqual([]);
  },
);
