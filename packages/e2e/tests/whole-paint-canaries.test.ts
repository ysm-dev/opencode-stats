import { chromium, webkit } from "playwright";
import { expect, it } from "vitest";
import { preferencesBrowser } from "./testing/preferences-server.ts";
import { installTourClock, tourTime } from "./testing/change-clock.ts";
import { tourStart } from "./testing/change-tour.ts";
import {
  assertPaintCheck,
  installWholePaintObserver,
  watchChangeRequests,
  wholeChange,
} from "./testing/whole-paint.ts";

it.each([chromium, webkit])(
  "%s rejects each planted whole-paint violation by its named check",
  async (browser) => {
    await using f = await preferencesBrowser(browser, { timezoneId: "UTC", locale: "en-GB" });
    f.server.writer.session("ses-valid-frame");
    f.server.writer.message({
      id: "msg-valid-frame",
      session: "ses-valid-frame",
      seq: 0,
      start: tourStart - 60000,
      tokens: { input: 300 },
    });
    f.server.writer.session("ses-valid-before");
    f.server.writer.message({
      id: "msg-valid-before",
      session: "ses-valid-before",
      seq: 0,
      start: tourStart - 86400000 - 60000,
      tokens: { input: 100 },
    });
    await installTourClock(f.context, tourStart);
    await f.context.addInitScript(installWholePaintObserver);
    const page = await f.context.newPage();
    await page.goto(`${f.server.origin}/?range=all`);
    await page.waitForFunction(() => window.wholePaint.evidence.complete > 0);
    await page.waitForFunction(
      () => document.querySelector(".headline-number")?.textContent === "1,387",
    );
    // Before = All time, then complete Today, then a third complete Today with
    // the new minute's comparison cut. None is a mixed or pending frame.
    await wholeChange(page, "preset", async () => {
      await page.getByRole("button", { name: /^Time range/ }).click();
      await page.getByRole("option", { name: "Today", exact: true }).click();
      await page.waitForFunction(
        () => performance.getEntriesByName("opencode-stats:change:preset").length > 0,
      );
      await tourTime(page, tourStart + 60000);
      await page.waitForFunction(
        () => performance.getEntriesByName("opencode-stats:change:minute").length > 0,
      );
    });
    expect(
      await page.getByRole("region", { name: "Tokens" }).locator(".previous-period").textContent(),
    ).toContain("through 23:59");
    await page.evaluate(() => {
      document.querySelector("[aria-labelledby=tokens]")!.setAttribute("data-state", "-1");
    });
    await page.waitForFunction(() => window.wholePaint.evidence.failures.includes("mixed-frame"));
    const mixed = await page.evaluate(() => window.wholePaint.evidence.failures);
    expect(() => assertPaintCheck("mixed-frame", mixed)).toThrow("whole-paint:mixed-frame");
    await page.reload();
    await page.waitForFunction(() => window.wholePaint.evidence.complete > 0);
    await page.evaluate(() => {
      document.querySelector(".headline-number")!.textContent = "Planted partial number";
    });
    await page.waitForFunction(() => window.wholePaint.evidence.failures.includes("mixed-frame"));
    const partial = await page.evaluate(() => window.wholePaint.evidence.failures);
    expect(() => assertPaintCheck("mixed-frame", partial)).toThrow("whole-paint:mixed-frame");
    await page.reload();
    await page.waitForFunction(() => window.wholePaint.evidence.complete > 0);
    await page.evaluate(() => {
      document
        .querySelector<HTMLElement>("main h1")!
        .style.setProperty("transition", "color 10s", "important");
    });
    await page.waitForFunction(() => window.wholePaint.evidence.failures.includes("animation"));
    const motion = await page.evaluate(() => window.wholePaint.evidence.failures);
    expect(() => assertPaintCheck("animation", motion)).toThrow("whole-paint:animation");
    await page.reload();
    await page.waitForFunction(() => window.wholePaint.evidence.complete > 0);
    const requests = watchChangeRequests(f.context);
    await page.evaluate(() => {
      document.querySelector(".filters input[type=checkbox]")!.addEventListener(
        "change",
        () => {
          void fetch("/api/server");
        },
        { once: true },
      );
    });
    await Promise.all([
      page.waitForResponse((response) => new URL(response.url()).pathname === "/api/server"),
      page.locator('.filters input[type="checkbox"]').first().click(),
    ]);
    expect(() => requests.check()).toThrow("whole-paint:user-change-network");
    const held = Promise.withResolvers<void>();
    const arrived = f.context.waitForEvent("request", {
      predicate: (request) => new URL(request.url()).pathname === "/api/browser-copy",
    });
    await f.context.route("**/api/browser-copy", async (route) => {
      await held.promise;
      await route.continue();
    });
    const early = await f.context.newPage();
    try {
      await early.goto(f.server.origin, { waitUntil: "domcontentloaded" });
      await arrived;
      await early.evaluate(() => {
        document.getElementById("root")!.innerHTML = "<h1>Planted partial page</h1>";
      });
      await early.waitForFunction(() =>
        window.wholePaint.evidence.failures.includes("early-load-paint"),
      );
      const load = await early.evaluate(() => window.wholePaint.evidence.failures);
      expect(() => assertPaintCheck("early-load-paint", load)).toThrow(
        "whole-paint:early-load-paint",
      );
    } finally {
      held.resolve();
    }
  },
);
