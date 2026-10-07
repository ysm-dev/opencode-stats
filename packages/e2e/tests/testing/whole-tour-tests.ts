import type { BrowserType, Page } from "playwright";
import { afterAll, describe, expect, it, onTestFailed } from "vitest";
import { preferencesBrowser, type preferencesServer } from "./preferences-server.ts";
import {
  readChangeEvidence,
  readCleanChangeMeasures,
  assertSummedMeasures,
} from "./change-measures.ts";
import {
  installWholePaintObserver,
  paintEvidence,
  assertPaintEvidence,
  watchChangeRequests,
} from "./whole-paint.ts";
import { changeTour, currentChangeKinds, tourStart } from "./change-tour.ts";
import { installTourClock } from "./change-clock.ts";
import { tourRounds, tourWidths, tourCases } from "./tour-plan.ts";
import { createTourEvidence, trackTourEvidence } from "./tour-evidence.ts";
import { createTourOwner, type TourScope } from "./tour-owner.ts";

const tourBrowser = (browser: BrowserType, width: number) =>
  preferencesBrowser(browser, {
    hasTouch: width === 360,
    viewport: { width, height: 720 },
    timezoneId: "UTC",
    locale: "en-GB",
    colorScheme: "light",
  });

function seedTour(server: Awaited<ReturnType<typeof preferencesServer>>) {
  server.writer.reset();
  server.writer.session("ses-tour");
  server.writer.message({
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
  server.writer.session("ses-tour-before");
  server.writer.message({
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
    server.writer.session(session);
    server.writer.message({
      id: `msg-tour-${letter}`,
      session,
      seq: 0,
      start: tourStart - 60000,
      provider: `synthetic-provider-extra-${letter}`,
      model: `synthetic-model-${letter}`,
      tokens: { input: 10 },
    });
  }
}

function assertCurrentKinds(kinds: readonly string[]) {
  for (const kind of currentChangeKinds)
    expect(
      kinds.filter((name) => name === kind).length,
      `unobserved-kind:${kind}`,
    ).toBeGreaterThanOrEqual(2);
  expect(kinds.filter((kind) => kind === "build").length).toBeGreaterThanOrEqual(
    tourRounds.length * 2,
  );
}

async function assertHeldFontBlank(page: Page) {
  const observations = await page.evaluate(async () => {
    const root = document.getElementById("root");
    const read = () => ({
      drawn: !!root?.children.length,
      font: document.fonts.check("440 13px Inter"),
      fontStatus: document.fonts.status,
      raf: window.wholePaint.evidence.rafCount,
      tasks: window.wholePaint.evidence.samples,
      blank: window.wholePaint.evidence.blank,
    });
    const snapshots = [read()];
    // Native task checkpoints, not rAF polling: WebKit can suppress rendering
    // callbacks while the required face is unavailable. Counters stay honest.
    for (let check = 0; check < 2; check++) {
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      snapshots.push(read());
    }
    return snapshots;
  });
  const expected = { drawn: false, font: false };
  expect(observations, "whole-paint:held-font").toMatchObject([expected, expected, expected]);
  expect(await page.locator("#root").textContent(), "whole-paint:early-load-paint").toBe("");
}

async function openChangeTour(
  browser: BrowserType,
  width: number,
  observing: boolean,
  scope: TourScope,
) {
  const f = await scope.use(tourBrowser(browser, width));
  seedTour(f.server);
  await installTourClock(f.context, tourStart);
  await f.context.addInitScript(installWholePaintObserver, observing);
  const page = await f.context.newPage();
  const workerCreated = page.waitForEvent("worker");
  await page.goto(`${f.server.origin}/?range=all`);
  await page.waitForFunction(
    () => document.querySelector(".headline-number")?.textContent === "350",
  );
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  expect(await (await workerCreated).evaluate(() => crossOriginIsolated)).toBe(true);
  if (observing) await page.waitForFunction(() => window.wholePaint.evidence.complete > 0);
  const guard = watchChangeRequests(f.context);
  const tour = changeTour(page, f.server, guard, width === 360);
  scope.signal.throwIfAborted();
  return {
    server: f.server,
    context: f.context,
    page,
    guard,
    tour,
  };
}

export const testWholePaintLoads = (browser: BrowserType, label: string) =>
  it.each([360, 1280])(
    `${label} complete packed first-visit and reload paints at %i retain font and copy barriers`,
    async (width) => {
      await using f = await tourBrowser(browser, width);
      seedTour(f.server);
      await installTourClock(f.context, tourStart);
      await f.context.addInitScript(installWholePaintObserver);
      const page = await f.context.newPage();
      page.on("console", (message) => {
        if (message.text().startsWith("[DEBUG-font-barrier]"))
          process.stderr.write(`${message.text()}\n`);
      });
      await page.addInitScript(() => {
        const load = document.fonts.load.bind(document.fonts);
        const state = () => ({
          ready: document.readyState,
          sheets: document.styleSheets.length,
          faces: [...document.fonts].map((face) => ({
            family: face.family,
            weight: face.weight,
            status: face.status,
          })),
        });
        document.fonts.load = (font, text) => {
          console.info("[DEBUG-font-barrier] call", JSON.stringify({ font, ...state() }));
          return load(font, text).then((faces) => {
            console.info(
              "[DEBUG-font-barrier] resolved",
              JSON.stringify({ matched: faces.length, ...state() }),
            );
            return faces;
          });
        };
      });
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
        await assertHeldFontBlank(page);
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
      const evidence = await paintEvidence(page);
      expect(evidence.blank).toBeGreaterThan(0);
    },
  );

async function verifyObservedTour(f: Awaited<ReturnType<typeof openChangeTour>>) {
  f.guard.check();
  const data = await readChangeEvidence(f.page);
  assertPaintEvidence(data);
  assertSummedMeasures(data.measures);
  assertCurrentKinds(data.measures.map((entry) => entry.kind));
}

async function verifyCleanTour(f: Awaited<ReturnType<typeof openChangeTour>>) {
  f.guard.check();
  const measures = await readCleanChangeMeasures(f.page);
  assertCurrentKinds(measures.map((entry) => entry.kind));
  expect(await f.page.evaluate(() => window.wholePaint.evidence.samples)).toBe(0);
  expect(
    await f.page.evaluate(
      () => performance.getEntriesByName("opencode-stats:whole-paint-probe").length,
    ),
  ).toBe(0);
}

function testPartitionedTour(browser: BrowserType, label: string, observing: boolean) {
  const mode = observing ? "whole-paint" : "observer-free";
  const verify = observing ? verifyObservedTour : verifyCleanTour;
  describe.each(tourWidths)(
    `${label} ${mode} complete tour at %i`,
    { concurrent: false },
    (width) => {
      let initialTrace: ReturnType<typeof createTourEvidence> | undefined;
      const owner = createTourOwner((scope) =>
        initialTrace!("fixture", "setup", () => openChangeTour(browser, width, observing, scope)),
      );
      const completed: (typeof tourCases)[number][] = [];
      afterAll(async () => {
        await owner[Symbol.asyncDispose]();
      });
      it.each(tourCases)("retains every native action in round $round, $stage", async (part) => {
        expect.hasAssertions();
        const trace = createTourEvidence(
          `${label}/${mode}/${width}/round-${part.round}/${part.stage}`,
        );
        initialTrace ??= trace;
        onTestFailed(() => owner.fail());
        await owner.run(async (f, signal) => {
          trackTourEvidence(f.page, trace, signal);
          expect(completed).toEqual(tourCases.slice(0, part.index));
          if (part.index === 0) await f.tour.prepare();
          await f.tour[part.stage](part.round);
          signal.throwIfAborted();
          f.guard.check();
        });
        completed.push(part);
      });
      it("proves both rounds and every kind completed, including both build milestones", async () => {
        expect.hasAssertions();
        onTestFailed(() => owner.fail());
        await owner.run(async (f) => {
          expect(completed).toEqual(tourCases);
          await verify(f);
        });
      });
    },
  );
}

export const testWholePaintTour = (browser: BrowserType, label: string) =>
  testPartitionedTour(browser, label, true);
export const testCleanChangeTimeTour = (browser: BrowserType, label: string) =>
  testPartitionedTour(browser, label, false);
