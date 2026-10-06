import { chromium, webkit, type Page, type BrowserContext } from "playwright";
import { expect, it } from "vitest";
import { preferencesBrowser } from "./testing/preferences-server.ts";
import { installTourClock, tourTime } from "./testing/change-clock.ts";
import { tourStart } from "./testing/change-tour.ts";
import {
  assertPaintCheck,
  installWholePaintObserver,
  paintEvidence,
  watchChangeRequests,
  wholeChange,
} from "./testing/whole-paint.ts";

async function acceptCoherentFrames(page: Page) {
  // Any number of complete states may paint during one input.
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
}

async function transientNumber(page: Page, afterPaint: boolean) {
  await page.evaluate(
    (painted) =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          const number = document.querySelector(".headline-number")!;
          const before = number.textContent;
          number.textContent = "Planted one-frame partial number";
          const restore = () => {
            number.textContent = before;
            resolve();
          };
          if (!painted) queueMicrotask(restore);
          else {
            const channel = new MessageChannel();
            channel.port1.addEventListener("message", () => {
              channel.port1.close();
              channel.port2.close();
              restore();
            });
            channel.port1.start();
            channel.port2.postMessage(null);
          }
        });
      }),
    afterPaint,
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function rejectFilterRequest(page: Page, context: BrowserContext) {
  const requests = watchChangeRequests(context);
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
}

async function rejectEarlyLoad(context: BrowserContext, origin: string) {
  const held = Promise.withResolvers<void>();
  const arrived = context.waitForEvent("request", {
    predicate: (request) => new URL(request.url()).pathname === "/api/browser-copy",
  });
  await context.route("**/api/browser-copy", async (route) => {
    await held.promise;
    await route.continue();
  });
  const early = await context.newPage();
  try {
    await early.goto(origin, { waitUntil: "domcontentloaded" });
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
}

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
    await acceptCoherentFrames(page);
    await transientNumber(page, false);
    await paintEvidence(page);
    await transientNumber(page, true);
    const late = await page.evaluate(() => window.wholePaint.evidence.failures);
    expect(() => assertPaintCheck("mixed-frame", late)).toThrow("whole-paint:mixed-frame");
    await page.reload();
    await page.waitForFunction(() => window.wholePaint.evidence.complete > 0);
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
    await rejectFilterRequest(page, f.context);
    await rejectEarlyLoad(f.context, f.server.origin);
  },
);
