import { chromium, webkit } from "playwright";
import { expect, it } from "vitest";
import { preferencesBrowser } from "./testing/preferences-server.ts";
import { observePreferences, wholePreferenceChange } from "./testing/preference-paint.ts";
import { preferenceEvidence } from "./testing/preference-evidence.ts";

declare global {
  interface Window {
    preferenceBackgrounds: string[];
  }
}
const browsers = [
  { name: "Chromium", engine: chromium },
  { name: "WebKit", engine: webkit },
];
it.each(browsers)(
  "$name paints a cold stored theme before the one module bundle, then follows other tabs without requests",
  async ({ engine }) => {
    await using fixture = await preferencesBrowser(engine);
    const { server, context } = fixture;
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
      await using evidence = await preferenceEvidence(page);
      await evidence.action("installed-preferences", async () => {
        page.on("pageerror", (error) => errors.push(error.message));
        evidence.mark("first-navigation", "started");
        await page.goto(server.origin, { waitUntil: "commit" });
        evidence.mark("first-navigation", "completed");
        await page.waitForFunction(() => document.documentElement.dataset["theme"] === "matrix");
        expect(await page.locator("#root").textContent()).toBe("");
        expect(
          await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor),
        ).toBe("rgb(235, 240, 232)");
        await page.evaluate(() => {
          window.preferenceBackgrounds = [];
          const colours = window.preferenceBackgrounds;
          const frame = (time: number) => {
            colours.push(getComputedStyle(document.documentElement).backgroundColor);
            window.preferenceEvidence.frame(time);
            if (colours.length < 3) requestAnimationFrame(frame);
          };
          requestAnimationFrame(frame);
        });
        evidence.mark("cold-prepaint", "completed");
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
        evidence.mark("cold-background-frames", "completed");
        releaseCopy();
        await page.getByRole("heading", { name: "Overview" }).waitFor();
        await context.unroute(/\/assets\/index-[^/]+\.js$/u);
        await context.unroute(/\/api\/browser-copy$/u);
        expect(await page.locator("html").getAttribute("data-theme")).toBe("matrix");
        expect(
          await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor),
        ).toBe("rgb(235, 240, 232)");
        expect(await page.locator("#oc-theme-preload").count()).toBe(0);
        evidence.mark("first-overview", "completed");
        evidence.mark("second-page", "started");
        const second = await context.newPage();
        evidence.mark("second-page", "completed");
        evidence.mark("second-navigation", "started");
        await second.goto(server.origin);
        evidence.mark("second-navigation", "completed");
        await second.getByRole("heading", { name: "Overview" }).waitFor();
        await evidence.click(
          "second-settings",
          second.getByRole("button", { name: "Settings", exact: true }),
        );
        evidence.mark("first-observation", "started");
        await observePreferences(page);
        evidence.mark("first-observation", "completed");
        context.on("request", (request) => requests.push(request.url()));
        await evidence.click(
          "first-settings",
          page.getByRole("button", { name: "Settings", exact: true }),
        );
        await wholePreferenceChange(
          page,
          async () => {
            await evidence.click("theme-trigger", page.getByRole("button", { name: /^Theme / }));
            await evidence.click(
              "theme-option",
              page.getByRole("option", { name: "Everforest", exact: true }),
            );
          },
          evidence,
        );
        await second.waitForFunction(
          () => document.documentElement.dataset["theme"] === "everforest",
          undefined,
          { polling: 10 },
        );
        await wholePreferenceChange(
          page,
          async () => {
            await evidence.click(
              "scheme-trigger",
              page.getByRole("button", { name: /^Color scheme/ }),
            );
            await evidence.click(
              "scheme-option",
              page.getByRole("option", { name: "Dark", exact: true }),
            );
          },
          evidence,
        );
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
        await wholePreferenceChange(
          page,
          () => page.emulateMedia({ colorScheme: "dark" }),
          evidence,
        );
        await second.emulateMedia({ colorScheme: "dark" });
        await second.waitForFunction(
          () => document.documentElement.dataset["colorScheme"] === "dark",
          undefined,
          { polling: 10 },
        );
        expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
        expect(requests).toEqual([]);
        expect(errors).toEqual([]);
      });
    } finally {
      unblock();
      releaseCopy();
      await context.unrouteAll({ behavior: "wait" });
    }
  },
);

it.each(browsers)(
  "$name still loads its installed dashboard when the native storage getter is denied",
  async ({ engine }) => {
    await using fixture = await preferencesBrowser(engine);
    const { server, context } = fixture;
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
    expect(await page.getByText("Your browser keeps preferences only for this tab.").count()).toBe(
      1,
    );
    await page.getByRole("button", { name: /^Theme / }).click();
    await page.getByRole("option", { name: "Matrix", exact: true }).click();
    expect(await page.evaluate(() => localStorage.getItem("opencode-theme-id"))).toBe("matrix");
    expect(await page.locator("html").getAttribute("data-theme")).toBe("matrix");
    await page.getByRole("button", { name: "Done" }).click();
    expect(await page.locator(".headline-number").textContent()).toBe("987");
  },
);
