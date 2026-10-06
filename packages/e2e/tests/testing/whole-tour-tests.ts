import type { BrowserType } from "playwright";
import { expect, it } from "vitest";
import { preferencesBrowser } from "./preferences-server.ts";
import { installWholePaintObserver, paintEvidence, watchChangeRequests } from "./whole-paint.ts";
import { changeTour, currentChangeKinds, tourStart } from "./change-tour.ts";
import { installTourClock } from "./change-clock.ts";

export const testWholePaintTour = (browser: BrowserType, label: string) =>
  it.each([360, 1280])(
    `${label} whole-paint packed tour at %i: whole frames, local changes, complete loads and no motion`,
    async (width) => {
      await using f = await preferencesBrowser(browser, {
        hasTouch: width === 360,
        viewport: { width, height: 720 },
        timezoneId: "UTC",
        locale: "en-GB",
        colorScheme: "light",
      });
      f.server.writer.reset();
      f.server.writer.session("ses-tour");
      f.server.writer.message({
        id: "msg-tour",
        session: "ses-tour",
        seq: 0,
        start: tourStart - 60000,
        model: "synthetic-model-a",
        provider: "synthetic-provider",
        tokens: { input: 200 },
        tools: [
          {
            id: "read",
            name: "read",
            status: "completed",
            ran: tourStart - 59000,
            completed: tourStart - 58000,
          },
          { id: "shell", name: "bash", status: "error", error: "tool.execution" },
          {
            id: "execute",
            name: "execute",
            status: "completed",
            nested: [{ id: "nested", name: "hidden.lookup", status: "completed" }],
          },
        ],
      });
      f.server.writer.session("ses-tour-before");
      f.server.writer.message({
        id: "msg-tour-before",
        session: "ses-tour-before",
        seq: 0,
        start: tourStart - 86400000,
        model: "synthetic-model-b",
        provider: "synthetic-provider",
        tokens: { input: 100 },
      });
      for (const letter of ["c", "d", "e", "f", "g"]) {
        const session = `ses-tour-${letter}`;
        f.server.writer.session(session);
        f.server.writer.message({
          id: `msg-tour-${letter}`,
          session,
          seq: 0,
          start: tourStart - 60000,
          provider: `synthetic-provider-extra-${letter}`,
          model: `synthetic-model-${letter}`,
          tokens: { input: 10 },
        });
      }
      await installTourClock(f.context, tourStart);
      await f.context.addInitScript(installWholePaintObserver);
      const page = await f.context.newPage();
      const workerCreated = page.waitForEvent("worker");
      const copied = page.waitForResponse(
        (response) => new URL(response.url()).pathname === "/api/browser-copy",
      );
      const fontRequested = f.context.waitForEvent("request", {
        predicate: (request) => new URL(request.url()).pathname.endsWith(".ttf"),
      });
      const fontRelease = Promise.withResolvers<void>();
      const fonts = /\.ttf$/;
      await f.context.route(fonts, async (route) => {
        await fontRelease.promise;
        await route.continue();
      });
      try {
        await page.goto(`${f.server.origin}/?range=all`, { waitUntil: "domcontentloaded" });
        await fontRequested;
        await (await copied).finished();
        expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
        expect(await (await workerCreated).evaluate(() => crossOriginIsolated)).toBe(true);
        // A fresh browser's first visit has no decoded font cache. Prove the
        // required face is actually unavailable, not just a redundant preload.
        expect(await page.evaluate(() => document.fonts.check("440 13px Inter"))).toBe(false);
        await page.waitForFunction(() => window.wholePaint.evidence.blank > 1);
        expect(await page.locator("#root").textContent(), "whole-paint:early-load-paint").toBe("");
      } finally {
        fontRelease.resolve();
      }
      await page.waitForFunction(
        () => document.querySelector(".headline-number")?.textContent === "350",
      );
      await page.waitForFunction(() => window.wholePaint.evidence.complete > 0);
      await paintEvidence(page);
      await f.context.unroute(fonts);
      const requested = f.context.waitForEvent("request", {
        predicate: (request) => new URL(request.url()).pathname === "/api/browser-copy",
      });
      const release = Promise.withResolvers<void>();
      await f.context.route("**/api/browser-copy", async (route) => {
        await release.promise;
        await route.continue();
      });
      try {
        await page.reload({ waitUntil: "domcontentloaded" });
        await requested;
        // Reload still has its own complete-copy barrier, even if WebKit keeps
        // a previously decoded font face while revalidating its preload.
        await page.waitForFunction(() => window.wholePaint.evidence.blank > 1);
        expect(await page.locator("#root").textContent(), "whole-paint:early-load-paint").toBe("");
      } finally {
        release.resolve();
      }
      await page.waitForFunction(
        () => document.querySelector(".headline-number")?.textContent === "350",
      );
      await page.waitForFunction(() => window.wholePaint.evidence.complete > 0);
      await paintEvidence(page);
      const guard = watchChangeRequests(f.context);
      await changeTour(page, f.server, guard, width === 360);
      guard.check();
      const evidence = await paintEvidence(page);
      expect(evidence.blank).toBeGreaterThan(0);
      const kinds = await page.evaluate(() =>
        performance.getEntriesByType("measure").map((entry) => entry.name),
      );
      for (const kind of currentChangeKinds) {
        expect(
          kinds.filter((name) => name === `opencode-stats:change:${kind}`).length,
          `unobserved-kind:${kind}`,
        ).toBeGreaterThanOrEqual(2);
      }
    },
  );
