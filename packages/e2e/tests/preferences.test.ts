import { chromium, webkit } from "playwright";
import { expect, it } from "vitest";
import { preferencesServer } from "./testing/preferences-server.ts";
import { createRequire } from "node:module";
import { observePreferences, wholePreferenceChange } from "./testing/preference-paint.ts";

declare global {
  interface Window {
    preferenceBackgrounds: string[];
  }
}
const browsers = [
  { name: "Chromium", engine: chromium },
  { name: "WebKit", engine: webkit },
];
const require = createRequire(import.meta.url);
it.each(browsers)(
  "$name paints a cold stored theme before the one module bundle, then follows other tabs without requests",
  async ({ engine }) => {
    const server = await preferencesServer();
    const browser = await engine.launch({ headless: true });
    const context = await browser.newContext();
    context.setDefaultTimeout(3000);
    let unblock!: () => void;
    const gate = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    let releaseCopy!: () => void;
    const copy = new Promise<void>((resolve) => {
      releaseCopy = resolve;
    });
    const errors: string[] = [];
    const requests: string[] = [];
    try {
      const classic = server.html.indexOf('<script id="preferences-startup">');
      expect(classic).toBeGreaterThan(0);
      expect(classic).toBeLessThan(server.html.indexOf('type="module"'));
      await context.addInitScript(() => {
        localStorage.setItem("opencode-theme-id", "matrix");
        localStorage.setItem("opencode-color-scheme", "light");
      });
      await context.route(/\/assets\/index-[^/]+\.js$/u, async (route) => {
        await gate;
        await route.continue();
      });
      await context.route(/\/api\/browser-copy$/u, async (route) => {
        await copy;
        await route.continue();
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(server.origin, { waitUntil: "commit" });
      await page.waitForFunction(() => document.documentElement.dataset["theme"] === "matrix");
      expect(await page.locator("#root").textContent()).toBe("");
      expect(
        await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor),
      ).toBe("rgb(235, 240, 232)");
      await page.evaluate(() => {
        window.preferenceBackgrounds = [];
        const colours = window.preferenceBackgrounds;
        const frame = () => {
          colours.push(getComputedStyle(document.documentElement).backgroundColor);
          if (colours.length < 3) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      unblock();
      await page.waitForFunction(() => window.preferenceBackgrounds.length === 3, undefined, {
        polling: 10,
      });
      expect(await page.evaluate(() => window.preferenceBackgrounds)).toEqual([
        "rgb(235, 240, 232)",
        "rgb(235, 240, 232)",
        "rgb(235, 240, 232)",
      ]);
      expect(await page.locator("#root").textContent()).toBe("");
      releaseCopy();
      await page.getByRole("heading", { name: "Overview" }).waitFor();
      await context.unroute(/\/assets\/index-[^/]+\.js$/u);
      await context.unroute(/\/api\/browser-copy$/u);
      expect(await page.locator("html").getAttribute("data-theme")).toBe("matrix");
      expect(
        await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor),
      ).toBe("rgb(235, 240, 232)");
      expect(await page.locator("#oc-theme-preload").count()).toBe(0);
      const second = await context.newPage();
      await second.goto(server.origin);
      await second.getByRole("heading", { name: "Overview" }).waitFor();
      await second.getByRole("button", { name: "Settings", exact: true }).click();
      await observePreferences(page);
      context.on("request", (request) => requests.push(request.url()));
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await wholePreferenceChange(page, async () => {
        await page.getByRole("button", { name: /^Theme / }).click();
        await page.getByRole("option", { name: "Everforest", exact: true }).click();
      });
      await second.waitForFunction(
        () => document.documentElement.dataset["theme"] === "everforest",
        undefined,
        { polling: 10 },
      );
      await wholePreferenceChange(page, async () => {
        await page.getByRole("button", { name: /^Color scheme/ }).click();
        await page.getByRole("option", { name: "Dark", exact: true }).click();
      });
      await second.waitForFunction(
        () => document.documentElement.dataset["colorScheme"] === "dark",
        undefined,
        { polling: 10 },
      );
      await page.getByText("Single-key shortcuts", { exact: true }).click();
      await second.waitForFunction(
        () => document.querySelector('[role="switch"]')?.getAttribute("aria-checked") === "false",
        undefined,
        { polling: 10 },
      );
      expect(await page.locator(".headline-number").textContent()).toBe("987");
      expect(await second.locator(".headline-number").textContent()).toBe("987");
      expect(await second.getByRole("button", { name: /^Theme / }).textContent()).toBe(
        "Everforest",
      );
      expect(await second.getByRole("button", { name: /^Color scheme/ }).textContent()).toBe(
        "Dark",
      );
      await page.getByRole("button", { name: /^Color scheme/ }).click();
      await page.getByRole("option", { name: "System", exact: true }).click();
      await page.emulateMedia({ colorScheme: "light" });
      await wholePreferenceChange(page, () => page.emulateMedia({ colorScheme: "dark" }));
      await second.emulateMedia({ colorScheme: "dark" });
      await second.waitForFunction(
        () => document.documentElement.dataset["colorScheme"] === "dark",
        undefined,
        { polling: 10 },
      );
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
      expect(requests).toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      unblock();
      releaseCopy();
      await context.unrouteAll({ behavior: "wait" });
      await context.close();
      await browser.close();
      await server.close();
    }
  },
);

const palettes = [
  { id: "oc-2", scheme: "light" },
  { id: "oc-2", scheme: "dark" },
  { id: "matrix", scheme: "light" },
  { id: "everforest", scheme: "light" },
];
it.each(browsers.flatMap((browser) => palettes.map((palette) => ({ ...browser, ...palette }))))(
  "$name $id $scheme Settings reflows, has measured contrast, and keeps visible keyboard focus",
  async ({ engine, id, scheme }) => {
    const server = await preferencesServer();
    const browser = await engine.launch({ headless: true });
    const context = await browser.newContext({ deviceScaleFactor: 2 });
    context.setDefaultTimeout(3000);
    try {
      await context.addInitScript(
        ({ theme, colour }) => {
          localStorage.setItem("opencode-theme-id", theme);
          localStorage.setItem("opencode-color-scheme", colour);
        },
        { theme: id, colour: scheme },
      );
      const page = await context.newPage();
      await page.goto(server.origin);
      await page.getByRole("heading", { name: "Overview" }).waitFor();
      await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
      for (const [width, height] of [
        [320, 720],
        [360, 720],
        [768, 720],
        [1280, 720],
        [320, 256],
        [640, 360],
      ]) {
        await page.setViewportSize({ width: width!, height: height! });
        await page.bringToFront();
        const gear = page.getByRole("button", { name: "Settings", exact: true });
        await gear.click();
        expect(
          await page
            .getByRole("heading", { name: "Settings" })
            .evaluate((heading) => heading === document.activeElement),
        ).toBe(true);
        await page.keyboard.press("Tab");
        const trigger = page.getByRole("button", { name: /^Color scheme/ });
        expect(await trigger.evaluate((element) => element === document.activeElement)).toBe(true);
        expect(
          await trigger.evaluate((element) => ({
            width: getComputedStyle(element).outlineWidth,
            gap: getComputedStyle(element).outlineOffset,
          })),
        ).toEqual({ width: "2px", gap: "-4px" });
        const a11y = await page.evaluate(() => window.axe.run());
        expect(a11y.violations).toEqual([]);
        expect(a11y.incomplete).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        const sizes = await page
          .locator(
            '.settings-sheet button, .settings-sheet [role="button"], .settings-sheet [data-slot="switch-label"]',
          )
          .evaluateAll((elements) =>
            elements.map((element) => ({
              width: element.getBoundingClientRect().width,
              height: element.getBoundingClientRect().height,
            })),
          );
        expect(sizes.every((size) => size.width >= 24 && size.height >= 24)).toBe(true);
        await page.getByRole("button", { name: /^Theme / }).click();
        await page.waitForFunction(
          () =>
            document.querySelector('[role="option"][aria-selected="true"]') ===
            document.activeElement,
        );
        await page.mouse.move(0, 0);
        await page.keyboard.type("z");
        const last = page.getByRole("option", { name: "Zenburn", exact: true });
        await page.evaluate(
          () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
        );
        const box = await last.boundingBox();
        const layout = await last.evaluate((element) => {
          const ancestors: Array<{
            tag: string;
            height: number;
            top: number;
            overflow: string;
            scroll: number;
            maximum: string;
          }> = [];
          for (let parent = element.parentElement; parent; parent = parent.parentElement)
            ancestors.push({
              tag: parent.tagName,
              height: parent.getBoundingClientRect().height,
              top: parent.getBoundingClientRect().top,
              overflow: getComputedStyle(parent).overflowY,
              scroll: parent.scrollTop,
              maximum: getComputedStyle(parent).maxHeight,
            });
          return { focus: document.activeElement?.id, scroll: scrollY, ancestors };
        });
        expect(
          await last.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            return [
              bounds.top >= 0,
              bounds.bottom <= innerHeight,
              bounds.left >= 0,
              bounds.right <= innerWidth,
            ];
          }),
          `${width}×${height}: ${JSON.stringify({ box, layout })}`,
        ).toEqual([true, true, true, true]);
        await page.keyboard.press("Escape");
        expect(await page.getByRole("dialog", { name: "Settings" }).count()).toBe(1);
        await page.keyboard.press("Escape");
        expect(await gear.evaluate((element) => element === document.activeElement)).toBe(true);
      }
    } finally {
      await context.close();
      await browser.close();
      await server.close();
    }
  },
);

it.each(browsers)(
  "$name still loads its installed dashboard when the native storage getter is denied",
  async ({ engine }) => {
    const server = await preferencesServer();
    const browser = await engine.launch({ headless: true });
    const context = await browser.newContext();
    context.setDefaultTimeout(3000);
    try {
      await context.addInitScript(() =>
        Object.defineProperty(window, "localStorage", {
          configurable: true,
          get: () => {
            throw new DOMException("denied", "SecurityError");
          },
        }),
      );
      const page = await context.newPage();
      await page.goto(server.origin);
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      expect(
        await page.getByText("Your browser keeps preferences only for this tab.").count(),
      ).toBe(1);
      await page.getByRole("button", { name: /^Theme / }).click();
      await page.getByRole("option", { name: "Matrix", exact: true }).click();
      expect(await page.evaluate(() => localStorage.getItem("opencode-theme-id"))).toBe("matrix");
      expect(await page.locator("html").getAttribute("data-theme")).toBe("matrix");
      await page.getByRole("button", { name: "Done" }).click();
      expect(await page.locator(".headline-number").textContent()).toBe("987");
    } finally {
      await context.close();
      await browser.close();
      await server.close();
    }
  },
);
