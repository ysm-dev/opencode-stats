import { createRequire } from "node:module";
import type { Browser, BrowserContext, Page, Request } from "playwright";
import type axe from "axe-core";
import { expect, vi } from "vitest";

declare global {
  interface Window {
    axe: typeof axe;
    overviewPaint: { blankFrames: number; partialFrames: string[] };
    pageRequests: number;
  }
}

const require = createRequire(import.meta.url);
const blockedAssets = {
  copy: /\/api\/browser-copy$/u,
  font: /\/Inter[^/]*\.ttf$/u,
  style: /\/(?:assets\/style[^/]*\.css|src\/style\.css)$/u,
};

function observeLoad(context: BrowserContext, page: Page) {
  const errors: string[] = [];
  const events: string[] = [];
  const pending = new Map<Request, { started: number; response?: number; status?: number }>();
  const record = (event: string) => {
    events.push(`${new Date().toISOString()} ${event}`);
    if (events.length > 60) events.shift();
  };
  context.on("request", (request) => {
    pending.set(request, { started: performance.now() });
    if (request.resourceType() !== "script")
      record(`request ${request.resourceType()} ${request.url()}`);
  });
  context.on("requestfinished", (request) => {
    pending.delete(request);
  });
  context.on("response", (response) => {
    const timing = pending.get(response.request());
    if (timing) {
      timing.response = performance.now();
      timing.status = response.status();
    }
    if (response.request().resourceType() === "script" && response.status() >= 400)
      errors.push(`Module load failed: ${response.status()} ${response.url()}`);
    if (response.request().resourceType() !== "script" || response.status() >= 400)
      record(`response ${response.status()} ${response.url()}`);
  });
  context.on("requestfailed", (request) => {
    pending.delete(request);
    record(`failed ${request.failure()?.errorText} ${request.url()}`);
  });
  page.on("framenavigated", (frame) => record(`navigation ${frame.url()}`));
  page.on("worker", (worker) => record(`worker ${worker.url()}`));
  page.on("console", (message) => {
    if (message.type() === "error") record(`console ${message.text()}`);
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
    record(`pageerror ${error.message}`);
  });
  return {
    errors,
    describe: (asset: string, width: number) =>
      JSON.stringify({
        observedAt: new Date().toISOString(),
        asset,
        width,
        page: page.url(),
        workers: page.workers().map((worker) => worker.url()),
        pending: [...pending].slice(-20).map(([request, timing]) => ({
          resource: request.resourceType(),
          url: request.url(),
          ageMs: Math.round(performance.now() - timing.started),
          responseMs:
            timing.response === undefined ? null : Math.round(timing.response - timing.started),
          status: timing.status ?? null,
        })),
        events,
      }),
  };
}

async function checkViewport(
  browser: Browser,
  origin: string,
  total: string,
  width: number,
  phase: (event: string) => void,
) {
  const context = await browser.newContext({
    viewport: { width, height: 720 },
    hasTouch: width === 360,
  });
  await context.addInitScript((expected) => {
    window.pageRequests = 0;
    const fetch = window.fetch.bind(window);
    window.fetch = (...args) => {
      window.pageRequests++;
      return fetch(...args);
    };
    window.overviewPaint = { blankFrames: 0, partialFrames: [] };
    const observe = () => {
      const root = document.getElementById("root");
      if (!root?.childElementCount) window.overviewPaint.blankFrames++;
      else if (
        document.querySelector("h1")?.textContent !== "Overview" ||
        document.querySelector(".headline-number")?.textContent !== expected ||
        !document.querySelector('[aria-labelledby="sessions"] .headline-number') ||
        new Set(
          [...document.querySelectorAll("[data-revision]")].map((region) =>
            region.getAttribute("data-revision"),
          ),
        ).size !== 1 ||
        !document.querySelector('nav[aria-label="Pages"]') ||
        !document.fonts.check("440 13px Inter") ||
        getComputedStyle(document.body).fontSize !== "13px" ||
        getComputedStyle(document.body).fontWeight !== "440"
      )
        window.overviewPaint.partialFrames.push(root.textContent);
      requestAnimationFrame(observe);
    };
    requestAnimationFrame(observe);
  }, total);
  const page = await context.newPage();
  const diagnostics = observeLoad(context, page);
  try {
    for (const asset of ["copy", "font", "style"] as const) {
      let blocked = false;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await context.route(blockedAssets[asset], async (route) => {
        blocked = true;
        await gate;
        await route.continue();
      });
      try {
        phase(`${width} ${asset} navigation`);
        await page.goto(`${origin}/?range=all`, { waitUntil: "commit" });
        phase(`${width} ${asset} committed`);
        await vi.waitFor(
          () => {
            if (!blocked)
              throw new Error(`Unobserved asset gate: ${diagnostics.describe(asset, width)}`);
          },
          { timeout: 10000 },
        );
        phase(`${width} ${asset} blocked`);
        const blank =
          asset === "style"
            ? await page.locator("#root").textContent()
            : await page.evaluate(
                () =>
                  new Promise<string | null>((resolve) => {
                    requestAnimationFrame(() =>
                      requestAnimationFrame(() =>
                        resolve(document.getElementById("root")!.textContent),
                      ),
                    );
                  }),
              );
        expect(blank).toBe("");
        expect(await page.locator("#root > *").count()).toBe(0);
      } finally {
        release();
      }
      await page
        .getByRole("region", { name: "Tokens" })
        .getByText(total, { exact: true })
        .waitFor({ timeout: 10000 });
      phase(`${width} ${asset} loaded`);
      await page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
      );
      expect(await page.title()).toBe("Overview · All time · opencode-stats");
      expect(await page.locator("html").getAttribute("lang")).toBe("en");
      expect(await page.getByRole("heading", { name: "Overview", level: 1 }).count()).toBe(1);
      expect(await page.getByRole("navigation", { name: "Pages" }).count()).toBe(1);
      expect(await page.getByRole("main").count()).toBe(1);
      expect(await page.getByRole("region", { name: "Sessions" }).textContent()).toMatch(
        /Sessions\s*\d[\d,]*\s*\+ \d[\d,]* subagent sessions/u,
      );
      expect(
        await page
          .getByRole("main")
          .evaluate(
            (main) =>
              getComputedStyle(main).backgroundColor ===
              getComputedStyle(document.documentElement).backgroundColor,
          ),
      ).toBe(false);
      expect(await page.getByRole("link", { name: "Skip to page" }).count()).toBe(1);
      expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
      expect(page.workers()).toHaveLength(1);
      expect(await page.evaluate(() => window.pageRequests)).toBe(0);
      expect(await page.workers()[0]!.evaluate(() => self.constructor.name)).toBe(
        "DedicatedWorkerGlobalScope",
      );
      const paint = await page.evaluate(() => window.overviewPaint);
      if (asset !== "style") expect(paint.blankFrames).toBeGreaterThan(0);
      expect(paint.partialFrames).toEqual([]);
      expect(diagnostics.errors).toEqual([]);
      await context.unroute(blockedAssets[asset]);
    }
    await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    phase(`${width} accessibility`);
    const accessibility = await page.evaluate(() => window.axe.run());
    expect(accessibility.violations).toEqual([]);
    expect(accessibility.incomplete).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    expect(await page.getByRole("main").evaluate((main) => main === document.activeElement)).toBe(
      true,
    );
  } finally {
    await context.close();
  }
}

export async function checkOverview(
  browser: Browser,
  origin: string,
  total: string,
  phase: (event: string) => void = () => {},
) {
  for (const width of [360, 1280]) await checkViewport(browser, origin, total, width, phase);
}
