import type { Page } from "playwright";
import { expect } from "vitest";
import type { preferenceEvidence } from "./preference-evidence.ts";

declare global {
  interface Window {
    preferenceFrames: string[];
    preferenceSnapshot: () => string;
    preferenceNumber: HTMLElement;
    preferenceRAF: number;
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
    const frame = (time: number) => {
      window.preferenceFrames.push(snapshot());
      if (window.preferenceFrames.length > 200) window.preferenceFrames.shift();
      window.preferenceEvidence.frame(time);
      window.preferenceRAF = requestAnimationFrame(frame);
    };
    window.preferenceRAF = requestAnimationFrame(frame);
  });
};

export const wholePreferenceChange = async (
  page: Page,
  change: () => Promise<void>,
  evidence: Awaited<ReturnType<typeof preferenceEvidence>>,
) =>
  evidence.action("whole-preference-change", async () => {
    evidence.mark("snapshot-before", "started");
    const before = await page.evaluate(() => {
      window.preferenceFrames = [];
      return window.preferenceSnapshot();
    });
    evidence.mark("snapshot-before", "completed");
    await change();
    evidence.mark("changed-snapshot", "started");
    await page.waitForFunction((old) => window.preferenceSnapshot() !== old, before);
    const after = await page.evaluate(() => window.preferenceSnapshot());
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const frames = await page.evaluate(() => window.preferenceFrames);
    evidence.mark("changed-snapshot", "completed");
    evidence.mark("whole-paint-assertions", "started");
    expect(after).not.toBe(before);
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.every((frame) => frame === before || frame === after)).toBe(true);
    // Settings makes the background inert; its retained headline still has to be the same node.
    expect(
      await page
        .getByRole("region", { name: "Tokens", includeHidden: true })
        .locator(".headline-number")
        .evaluate((element) => element === window.preferenceNumber),
    ).toBe(true);
    evidence.mark("whole-paint-assertions", "completed");
  });
