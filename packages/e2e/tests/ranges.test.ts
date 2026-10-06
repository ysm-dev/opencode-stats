import { chromium, webkit, type Page } from "playwright";
import { expect, it } from "vitest";
import { preferencesBrowser } from "./testing/preferences-server.ts";
import { installTourClock, tourTime } from "./testing/change-clock.ts";
import {
  installWholePaintObserver,
  wholeChange,
  watchChangeRequests,
} from "./testing/whole-paint.ts";

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
    const snapshot = window.rangeSnapshot;
    const frame = () => {
      window.rangeFrames.push(snapshot());
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
    const today = Math.floor(Date.now() / 86400000) * 86400000;
    const now = today + (14 * 60 + 2) * 60000;
    // Keep the actual worker schedulers/live stream enabled. Only the synthetic
    // wall clock is controlled, so a real minute cannot create a third valid
    // frame inside the legacy exact before/after assertions below.
    await installTourClock(fixture.context, now);
    await fixture.context.addInitScript(installWholePaintObserver);
    for (const [id, start, input] of [
      ["previous", today - 86400000 + (now - today) / 2, 100],
      ["current", today + (now - today) / 2, 112],
    ] as const) {
      const session = `ses-range-${id}`;
      fixture.server.writer.session(session);
      fixture.server.writer.message({
        id: `prompt-range-${id}`,
        session,
        seq: 0,
        start: Math.floor(start) - 1,
        type: "user",
      });
      fixture.server.writer.message({
        id: `msg-range-${id}`,
        session,
        seq: 1,
        start: Math.floor(start),
        tokens: { input, cache: { read: 0, write: 0 } },
        streamEnd: Math.floor(start) + (id === "current" ? 200 : 100),
        completed: Math.floor(start) + 300,
        error: id === "current" ? "aborted" : "api.error",
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
    const headline = (name: string) => page.getByRole("region", { name, exact: true });
    expect(await headline("Steps").textContent()).toContain("1 per prompt");
    expect(await headline("Prompts").locator(".headline-number").textContent()).toBe("1");
    expect(await headline("Failed steps").textContent()).toContain(
      "0% failure rate · 1 interrupted",
    );
    expect(await headline("Failed steps").locator(".previous-period").textContent()).toContain(
      "↓ 100%",
    );
    expect(await headline("Response time p50").textContent()).toContain(
      "p95 0.2 s · 100% of steps timed",
    );
    expect(await headline("Response time p50").textContent()).toContain("Recorded from");
    expect(await headline("Cache hit rate").textContent()).toContain("context size median 112");
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
    const clockRequests = watchChangeRequests(fixture.context);
    await wholeChange(page, "remove-fixed", () =>
      page.getByRole("button", { name: /Remove fixed range/ }).click(),
    );
    expect(await page.title()).toBe("Overview · Today · opencode-stats");
    expect(await tokens.textContent()).toBe("112");
    await wholeChange(page, "minute", () => tourTime(page, now + 60000));
    expect(await comparison.textContent()).toContain("through 14:03");
    await wholeChange(page, "day", () => tourTime(page, today + 86400000 + 60000));
    expect(await tokens.textContent()).toBe("0");
    expect(await page.getByRole("button", { name: /Pause live updates/ }).count()).toBe(1);
    clockRequests.check();
  },
);
