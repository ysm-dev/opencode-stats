import type { Page } from "playwright";
import { expect } from "vitest";

declare global {
  interface Window {
    filterSnapshot: () => string;
    filterFrames: string[];
  }
}

export const observeFilters = async (page: Page) =>
  page.evaluate(() => {
    window.filterSnapshot = () =>
      JSON.stringify({
        states: [...document.querySelectorAll("[data-range]")].map((node) =>
          node.getAttribute("data-range"),
        ),
        ticks: [
          ...document.querySelectorAll<HTMLInputElement>('.filters input[type="checkbox"]'),
        ].map((input) => [input.id, input.checked]),
        amounts: [...document.querySelectorAll(".filter-amount")].map((node) => node.textContent),
        bars: [...document.querySelectorAll<HTMLElement>(".filter-bar")].map(
          (node) => node.style.width,
        ),
        chips: document.querySelector(".filter-chips")!.textContent,
        numbers: [...document.querySelectorAll(".headline-number")].map((node) => node.textContent),
        address: location.search,
      });
    const frames: string[] = [];
    window.filterFrames = frames;
    const sample = () => {
      frames.push(window.filterSnapshot());
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });

export async function wholeFilter(page: Page, action: () => Promise<void>, tokens: string) {
  const old = await page.evaluate(() => {
    window.filterFrames.length = 0;
    return window.filterSnapshot();
  });
  await action();
  await page.waitForFunction(
    (number) => document.querySelector(".headline-number")!.textContent === number,
    tokens,
  );
  const sampled = await page.evaluate(
    () =>
      new Promise<{ current: string; frames: string[] }>((resolve) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            resolve({ current: window.filterSnapshot(), frames: window.filterFrames }),
          ),
        );
      }),
  );
  expect(sampled.current).not.toBe(old);
  expect(sampled.frames.length).toBeGreaterThan(0);
  for (const frame of sampled.frames) expect([old, sampled.current]).toContain(frame);
}
