import type { Page } from "playwright";
import { expect } from "vitest";

declare global {
  interface Window {
    preferenceFrames: string[];
    preferenceSnapshot: () => string;
    preferenceNumber: HTMLElement;
  }
}

export const observePreferences = async (page: Page) => {
  await page.bringToFront();
  await page.evaluate(() => {
    const root = document.documentElement;
    const roles = [
      "text-base",
      "muted-base",
      "focus-base",
      "edge-base",
      "series-1",
      "series-8",
      "level-1",
      "level-4",
    ];
    window.preferenceNumber = document.querySelector<HTMLElement>(".headline-number")!;
    window.preferenceSnapshot = () => {
      const style = getComputedStyle(root);
      return JSON.stringify([
        root.dataset["theme"],
        root.dataset["colorScheme"],
        style.backgroundColor,
        getComputedStyle(document.querySelector("main")!).backgroundColor,
        ...roles.map((role) => style.getPropertyValue(`--dashboard-${role}`)),
        window.preferenceNumber.isConnected,
        window.preferenceNumber.textContent,
      ]);
    };
    window.preferenceFrames = [];
    const snapshot = window.preferenceSnapshot;
    const frame = () => {
      window.preferenceFrames.push(snapshot());
      if (window.preferenceFrames.length > 200) window.preferenceFrames.shift();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
};

export const wholePreferenceChange = async (page: Page, change: () => Promise<void>) => {
  const before = await page.evaluate(() => {
    window.preferenceFrames = [];
    return window.preferenceSnapshot();
  });
  await change();
  await page.waitForFunction((old) => window.preferenceSnapshot() !== old, before);
  const after = await page.evaluate(() => window.preferenceSnapshot());
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const frames = await page.evaluate(() => window.preferenceFrames);
  expect(after).not.toBe(before);
  expect(frames.length).toBeGreaterThan(0);
  expect(frames.every((frame) => frame === before || frame === after)).toBe(true);
  expect(
    await page
      .locator(".headline-number")
      .evaluate((element) => element === window.preferenceNumber),
  ).toBe(true);
};
