import { chromium, webkit, type Page } from "playwright";
import { expect, it } from "vitest";
import { preferencesBrowser } from "./testing/preferences-server.ts";

declare global {
  interface Window {
    rangeFrames: string[];
    rangeSnapshot: () => string;
  }
}

const watchRanges = async (page: Page) =>
  page.evaluate(() => {
    window.rangeSnapshot = () =>
      JSON.stringify([
        ...[...document.querySelectorAll("[data-range]")].map((region) =>
          region.getAttribute("data-range"),
        ),
        document.querySelector('.range-control [data-slot="select-v2-value-text"]')!.textContent,
        ...[...document.querySelectorAll(".headline-number")].map((number) => number.textContent),
        ...[...document.querySelectorAll(".previous-period")].map((caption) => caption.textContent),
        document.title,
        document.querySelector(".fixed-range")?.textContent,
      ]);
    window.rangeFrames = [];
    const frame = () => {
      window.rangeFrames.push(window.rangeSnapshot());
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });

const wholeRange = async (page: Page, action: () => Promise<void>, title: string) => {
  const before = await page.evaluate(() => {
    window.rangeFrames = [];
    return window.rangeSnapshot();
  });
  await action();
  await page.waitForFunction((expected) => document.title === expected, title);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const after = await page.evaluate(() => window.rangeSnapshot());
  const frames = await page.evaluate(() => window.rangeFrames);
  expect(after).not.toEqual(before);
  expect(frames).not.toHaveLength(0);
  expect(frames.filter((frame) => ![before, after].includes(frame))).toEqual([]);
};

it.each([chromium, webkit])(
  "paints packed ranges whole, restores history and bookmarks, and sends no user-change requests in %s",
  async (browser) => {
    const touch = browser === webkit;
    await using fixture = await preferencesBrowser(browser, {
      timezoneId: "UTC",
      locale: "en-GB",
      hasTouch: touch,
      viewport: { width: touch ? 360 : 1280, height: 720 },
    });
    const now = Date.now();
    const today = Math.floor(now / 86400000) * 86400000;
    for (const [id, start, input] of [
      ["previous", today - 86400000 + (now - today) / 2, 100],
      ["current", today + (now - today) / 2, 112],
    ] as const) {
      const session = `ses-range-${id}`;
      fixture.server.writer.session(session);
      fixture.server.writer.message({
        id: `msg-range-${id}`,
        session,
        seq: 0,
        start: Math.floor(start),
        tokens: { input },
      });
    }
    const page = await fixture.context.newPage();
    await page.goto(fixture.server.origin);
    const tokens = page.getByRole("region", { name: "Tokens" }).locator(".headline-number");
    await page.waitForFunction(
      () => document.querySelector(".headline-number")?.textContent === "212",
    );
    expect(await page.title()).toBe("Overview · Last 30 days · opencode-stats");
    expect(new URL(page.url()).search).toBe("?range=30d");
    await watchRanges(page);
    const requests: string[] = [];
    fixture.context.on("request", (request) => requests.push(request.url()));
    const select = page.getByRole("button", { name: /^Time range/ });
    expect(
      await select.evaluate((element) => Math.round(element.getBoundingClientRect().height)),
    ).toBe(touch ? 44 : 28);
    await wholeRange(
      page,
      async () => {
        await select.click();
        expect(
          await page
            .getByRole("option", { name: "Today", exact: true })
            .evaluate((element) => element.getBoundingClientRect().height),
        ).toBeGreaterThanOrEqual(touch ? 44 : 28);
        await page.getByRole("option", { name: "Today", exact: true }).click();
      },
      "Overview · Today · opencode-stats",
    );
    expect(await tokens.textContent()).toBe("112");
    expect(
      await page.getByRole("region", { name: "Tokens" }).locator(".previous-period").textContent(),
    ).toContain("↑ 12%");
    const comparison = page.getByRole("region", { name: "Tokens" }).locator(".previous-period");
    expect(
      await comparison.evaluate((element) => {
        const muted = document.createElement("span");
        muted.style.color = "var(--dashboard-muted-base)";
        element.append(muted);
        const matches = getComputedStyle(element).color === getComputedStyle(muted).color;
        muted.remove();
        return matches;
      }),
    ).toBe(true);
    const previousDate = new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(today - 86400000);
    const fixedTitle = `Overview · ${previousDate} – ${previousDate} · opencode-stats`;
    await wholeRange(
      page,
      () => page.getByRole("button", { name: "Previous range" }).click(),
      fixedTitle,
    );
    const fixedAddress = page.url();
    expect(await tokens.textContent()).toBe("100");
    await wholeRange(
      page,
      () => page.getByRole("button", { name: "Next range" }).click(),
      "Overview · Today · opencode-stats",
    );
    expect(await select.evaluate((element) => element === document.activeElement)).toBe(true);
    await wholeRange(
      page,
      async () => {
        await page.goBack();
      },
      fixedTitle,
    );
    await wholeRange(
      page,
      async () => {
        await page.goForward();
      },
      "Overview · Today · opencode-stats",
    );
    expect(requests).toEqual([]);
    expect(await page.getByRole("status").textContent()).toBe("");
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    await page.goto(fixedAddress);
    await page.getByRole("button", { name: /Remove fixed range/ }).waitFor();
    expect(page.url()).toBe(fixedAddress);
    expect(await page.title()).toBe(fixedTitle);
    expect(await tokens.textContent()).toBe("100");
  },
);
