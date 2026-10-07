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
import { readCleanChangeMeasures } from "./testing/change-measures.ts";

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

async function transientNumber(
  page: Page,
  restoration: "microtask" | "nested-microtask" | "message",
) {
  await page.evaluate(
    (mode) =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          const number = document.querySelector(".headline-number")!;
          const before = number.textContent;
          number.textContent = "Planted one-frame partial number";
          const restore = () => {
            number.textContent = before;
            resolve();
          };
          if (mode === "microtask") queueMicrotask(restore);
          else if (mode === "nested-microtask") queueMicrotask(() => queueMicrotask(restore));
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
    restoration,
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function resizeObserverCorruption(page: Page, property: boolean) {
  const rounds = await page.evaluate(
    (propertyOnly) =>
      new Promise<number>((resolve) => {
        const outer = document.createElement("div");
        const inner = document.createElement("div");
        outer.style.cssText =
          "position:fixed;left:0;top:0;width:1px;height:1px;pointer-events:none";
        inner.style.width = "1px";
        outer.append(inner);
        document.body.append(outer);
        const number = document.querySelector(".headline-number")!;
        const checkbox = document.querySelector<HTMLInputElement>(
          '.filters input[type="checkbox"]',
        )!;
        const before = { text: number.textContent, checked: checkbox.checked };
        let deliveries = 0;
        const resize = new ResizeObserver((entries) => {
          deliveries++;
          if (entries.some((entry) => entry.target === outer)) {
            // Force a second, deeper RO delivery in the *same* rendering turn.
            inner.style.width = "2px";
            return;
          }
          resize.disconnect();
          if (propertyOnly) checkbox.checked = !before.checked;
          else number.textContent = "Planted post-rAF ResizeObserver partial number";
          const channel = new MessageChannel();
          channel.port1.addEventListener("message", () => {
            number.textContent = before.text;
            checkbox.checked = before.checked;
            outer.remove();
            channel.port1.close();
            channel.port2.close();
            resolve(deliveries);
          });
          channel.port1.start();
          channel.port2.postMessage(null);
        });
        resize.observe(outer);
        resize.observe(inner);
        requestAnimationFrame(() => {
          outer.style.width = "2px";
        });
      }),
    property,
  );
  expect(rounds).toBe(2);
}

async function reloadComplete(page: Page) {
  await page.reload();
  await page.waitForFunction(() => window.wholePaint.evidence.complete > 0);
}

async function expectMixedFrame(page: Page) {
  await page.waitForFunction(() => window.wholePaint.evidence.failures.includes("mixed-frame"));
  const failed = await page.evaluate(() => window.wholePaint.evidence.failures);
  expect(() => assertPaintCheck("mixed-frame", failed)).toThrow("whole-paint:mixed-frame");
}

async function renderingPhaseCanaries(page: Page) {
  await transientNumber(page, "microtask");
  await paintEvidence(page);
  await transientNumber(page, "nested-microtask");
  await paintEvidence(page);
  await transientNumber(page, "message");
  await expectMixedFrame(page);
  await reloadComplete(page);
  await resizeObserverCorruption(page, false);
  await expectMixedFrame(page);
  await reloadComplete(page);
  await resizeObserverCorruption(page, true);
  await expectMixedFrame(page);
  await reloadComplete(page);
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

async function rejectMotionStyles(page: Page) {
  for (const target of ["inline", "::before", "::after"] as const) {
    // The observer has already seen the element with no motion/pseudo content.
    // A stylesheet rule must update the retained live style, not just a new one.
    await page.waitForFunction(() => window.wholePaint.evidence.complete > 1);
    const animations = await page.evaluate((pseudo) => {
      if (pseudo === "inline")
        document
          .querySelector<HTMLElement>("main h1")!
          .style.setProperty("transition", "color 10s", "important");
      else {
        const style = document.createElement("style");
        document.head.append(style);
        style.sheet!.insertRule(
          `main h1${pseudo} { content: "planted"; ${pseudo === "::before" ? "transition" : "animation"}-duration: 10s !important; }`,
        );
      }
      // No running animation can mask a stale computed-style check.
      return document.getAnimations().length;
    }, target);
    expect(animations).toBe(0);
    await page.waitForFunction(() => window.wholePaint.evidence.failures.includes("animation"));
    const motion = await page.evaluate(() => window.wholePaint.evidence.failures);
    expect(() => assertPaintCheck("animation", motion)).toThrow("whole-paint:animation");
    await reloadComplete(page);
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
    await expect(readCleanChangeMeasures(page)).rejects.toThrow("change-clock:probe-contaminated");
    // Reject actual recorded probe work even if a consumer accidentally clears
    // the mode marker. This does not stop the observer or change its checks.
    await page.evaluate(() => {
      window.wholePaint.observing = false;
    });
    try {
      await expect(readCleanChangeMeasures(page)).rejects.toThrow(
        "change-clock:probe-contaminated",
      );
    } finally {
      await page.evaluate(() => {
        window.wholePaint.observing = true;
      });
    }
    await renderingPhaseCanaries(page);
    await page.evaluate(() => {
      document.querySelector("[aria-labelledby=tokens]")!.setAttribute("data-state", "-1");
    });
    await expectMixedFrame(page);
    await reloadComplete(page);
    await page.evaluate(() => {
      document.querySelector(".headline-number")!.textContent = "Planted partial number";
    });
    await expectMixedFrame(page);
    await reloadComplete(page);
    await rejectMotionStyles(page);
    await rejectFilterRequest(page, f.context);
    await rejectEarlyLoad(f.context, f.server.origin);
  },
);
