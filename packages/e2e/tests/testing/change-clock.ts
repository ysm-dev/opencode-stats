import type { BrowserContext, Page } from "playwright";

// Portable worker wall-clock control, restricted to the installed synthetic tour.
// The packed engine and monotonic performance clock are untouched. Changing
// Date.now lets its real second/minute/day schedulers notice a clock boundary.
export async function installTourClock(context: BrowserContext, now: number) {
  await context.route(/\/assets\/worker-[^/]+\.js$/, async (route) => {
    const response = await route.fetch();
    const prelude = `{
      let now = ${now};
      Date.now = () => now;
      const channel = new BroadcastChannel("synthetic-tour-clock");
      channel.addEventListener("message", event => {
        if (typeof event.data !== "number" || !Number.isFinite(event.data)) return;
        now = event.data; channel.postMessage(now);
      });
    }\n`;
    await route.fulfill({ response, body: prelude + (await response.text()) });
  });
}

export async function tourTime(page: Page, now: number) {
  await page.evaluate(
    (time) =>
      new Promise<void>((resolve, reject) => {
        const channel = new BroadcastChannel("synthetic-tour-clock");
        const timer = setTimeout(() => {
          channel.close();
          reject(new Error("whole-paint:tour-clock-unavailable"));
        }, 1000);
        channel.addEventListener("message", () => {
          clearTimeout(timer);
          channel.close();
          resolve();
        });
        // oxlint-disable-next-line unicorn/require-post-message-target-origin -- BroadcastChannel.postMessage has no Window targetOrigin parameter.
        channel.postMessage(time);
      }),
    now,
  );
}

// Headless engines do not hide a tab just because another page is foregrounded.
// Feed the existing document sensor/listener, never an engine-only test message.
export async function tourVisibility(page: Page, hidden: boolean) {
  await page.evaluate((value) => {
    Object.defineProperty(document, "hidden", { configurable: true, value });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: value ? "hidden" : "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}
