import { chromium } from "playwright";
import { expect, it } from "vitest";
import { preferencesBrowser } from "./testing/preferences-server.ts";

declare global {
  interface Window {
    livePaints: Array<{
      tokens: string | null;
      facts: string | undefined;
      status: string | undefined;
    }>;
    liveNumber: Element;
  }
}

it("paints packed live edits and deletes within two seconds, whole and without reload or lost focus", async () => {
  await using fixture = await preferencesBrowser(chromium);
  const page = await fixture.context.newPage();
  let navigations = 0;
  page.on("request", (request) => {
    if (request.isNavigationRequest()) navigations++;
  });
  await page.goto(`${fixture.server.origin}/?range=all`);
  await page.getByRole("region", { name: "Tokens" }).getByText("987", { exact: true }).waitFor();
  await page.getByRole("link", { name: "Skip to page" }).focus();
  await page.keyboard.press("Enter");
  await page.evaluate(() => {
    window.livePaints = [];
    window.liveNumber = document.querySelector(".headline-number")!;
    const paints = window.livePaints;
    const number = window.liveNumber;
    const frame = () => {
      paints.push({
        tokens: number.textContent,
        facts: document.querySelector<HTMLElement>('[aria-labelledby="tokens"]')!.dataset[
          "revision"
        ],
        status: document.querySelector<HTMLElement>(".live-status")!.dataset["revision"],
      });
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  const started = performance.now();
  fixture.server.writer.message({
    id: "msg-preferences",
    session: "ses-preferences",
    seq: 0,
    start: 1,
    tokens: { input: 2000, output: 5 },
  });
  await page.waitForFunction(
    () => document.querySelector(".headline-number")?.textContent === "2,005",
    undefined,
    { timeout: 2000 },
  );
  expect(performance.now() - started).toBeLessThan(2000);
  expect(await page.getByText("Last write just now").count()).toBe(1);
  const removed = performance.now();
  fixture.server.writer.revert("ses-preferences", 0);
  await page.waitForFunction(
    () => document.querySelector(".headline-number")?.textContent === "0",
    undefined,
    { timeout: 2000 },
  );
  expect(performance.now() - removed).toBeLessThan(2000);
  const frames = await page.evaluate(() => window.livePaints);
  expect(frames.length).toBeGreaterThan(0);
  expect(
    frames.every(
      (frame) => frame.facts === frame.status && ["987", "2,005", "0"].includes(frame.tokens!),
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() => document.querySelector(".headline-number") === window.liveNumber),
  ).toBe(true);
  expect(
    await page.getByRole("main").evaluate((element) => element === document.activeElement),
  ).toBe(true);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  expect(navigations).toBe(1);
});

it("a packed unknown-newer migration preserves statistics and shows the standalone fix, then recovers whole", async () => {
  await using fixture = await preferencesBrowser(chromium);
  const page = await fixture.context.newPage();
  await page.goto(`${fixture.server.origin}/?range=all`);
  const tokens = page.getByRole("region", { name: "Tokens" }).getByText("987", { exact: true });
  await tokens.waitFor();
  fixture.server.writer.migration("20261007120000_unknown_newer");
  const line = page.locator('.update-status[data-sync-reason="schema.newer"]');
  await line.waitFor();
  expect(await line.textContent()).toMatch(
    /^Not updating since .+ · OpenCode's database is newer than opencode-stats 0\.2\.0 understands · run bunx opencode-stats@latest$/u,
  );
  expect(await line.getAttribute("data-warning")).toBe("true");
  expect(await tokens.count()).toBe(1);
  expect(await page.locator(".live-status").getAttribute("data-updating")).toBe("false");
  fixture.server.writer.message({
    id: "msg-preferences",
    session: "ses-preferences",
    seq: 0,
    start: 1,
    tokens: { input: 2000 },
  });
  await page.waitForTimeout(550);
  expect(await tokens.count()).toBe(1);
  fixture.server.writer.migration("20261007120000_unknown_newer", false);
  await page.getByRole("region", { name: "Tokens" }).getByText("2,000", { exact: true }).waitFor();
  expect(await page.locator(".update-status").count()).toBe(0);
  expect(await page.locator(".live-status").getAttribute("data-updating")).toBe("true");
  expect(await page.getByRole("status").filter({ hasText: "Up to date again" }).count()).toBe(1);
});
