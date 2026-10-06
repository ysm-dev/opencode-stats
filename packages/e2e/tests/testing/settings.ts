import type { BrowserType } from "playwright";
import { expect, it } from "vitest";
import { createRequire } from "node:module";
import { preferencesBrowser } from "./preferences-server.ts";

const require = createRequire(import.meta.url);
const palettes = [
  { id: "oc-2", scheme: "light" },
  { id: "oc-2", scheme: "dark" },
  { id: "matrix", scheme: "light" },
  { id: "everforest", scheme: "light" },
];

export const testSettings = (engine: BrowserType, name: string) =>
  it.concurrent.each(palettes)(
    `${name} $id $scheme Settings reflows, has measured contrast, and keeps visible keyboard focus`,
    async ({ id, scheme }) => {
      await using fixture = await preferencesBrowser(engine, { deviceScaleFactor: 2 });
      const { server, context } = fixture;
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
        await page.keyboard.press("End");
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
    },
  );
