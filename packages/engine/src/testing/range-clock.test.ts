import { expect, it, vi, onTestFinished } from "vitest";
import { syntheticCopy, inMemoryDashboardServer } from "@opencode-stats/browser-copy/testing";
import { presets } from "../index.ts";
import { systemClock } from "../clock.ts";
import { inThreadEngine } from "./index.ts";
import { rangeFixture, rangeStep } from "./range-fixture.ts";

it("passes the actual browser clock, locale and IANA zone through the complete-state seam", async () => {
  const server = inMemoryDashboardServer(syntheticCopy([]));
  const engine = inThreadEngine(server.fetch, queueMicrotask, systemClock);
  onTestFinished(async () => {
    await engine.dispose();
    await server.dispose();
  });
  const result = await engine.client.request({ kind: "address", address: "/" });
  expect(result).toMatchObject({
    kind: "paint",
    state: {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      rangeLabel: "Last 30 days",
    },
  });
});

it.each(presets)("moves %s once at local midnight, including a 45-minute zone", async (preset) => {
  const f = rangeFixture([], "2026-10-07T18:14:59Z", "Asia/Kathmandu");
  const before = await f.request({ kind: "preset", preset });
  await vi.waitFor(() => expect(f.server.streams).toBe(1));
  const paints = f.states.length;
  const requests = f.server.requests;
  await f.clock.advance(1);
  expect(f.states).toHaveLength(paints + 1);
  expect(f.states.at(-1)).toMatchObject({
    address: before.address,
    period: { to: "2026-10-08", end: Date.parse("2026-10-07T18:15Z") },
  });
  expect(f.server.requests).toBe(requests);
  await f.clock.advance(1);
  expect(f.states).toHaveLength(paints + 1);
});

it("moves the elapsed comparison cut on a new minute, without a data write or request", async () => {
  const f = rangeFixture([
    rangeStep(Date.parse("2026-10-01")),
    rangeStep(Date.parse("2026-10-06T14:01Z"), 100),
    rangeStep(Date.parse("2026-10-06T14:02:30Z"), 100),
    rangeStep(Date.parse("2026-10-07T14:01Z"), 200),
  ]);
  expect((await f.request({ kind: "preset", preset: "today" })).comparison.tokens).toBe("↑ 100%");
  await vi.waitFor(() => expect(f.server.streams).toBe(1));
  const before = f.states.length;
  const requests = f.server.requests;
  await f.clock.advance(59);
  expect(f.states).toHaveLength(before);
  await f.clock.advance(1);
  expect(f.states).toHaveLength(before + 1);
  expect(f.states.at(-1)).toMatchObject({
    comparison: {
      tokens: "↑ 0%",
      caption: "Previous period · 6 Oct 2026 – 6 Oct 2026 · through 14:03",
    },
  });
  expect(f.server.requests).toBe(requests);
});

it("re-indexes every day's dimensions on timezone changes and pins fixed ranges to their dates", async () => {
  const f = rangeFixture([
    rangeStep(Date.parse("2026-10-06T02:00Z"), 10),
    rangeStep(Date.parse("2026-10-07T01:00Z"), 20),
  ]);
  const before = await f.request({
    kind: "address",
    address: "/?range=fixed&from=2026-10-06&to=2026-10-06",
  });
  expect(before.tokens.total).toBe(10);
  await vi.waitFor(() => expect(f.server.streams).toBe(1));
  const paints = f.states.length;
  f.setZone("America/New_York");
  await f.clock.advance(1);
  expect(f.states).toHaveLength(paints + 1);
  expect(f.states.at(-1)).toMatchObject({
    address: before.address,
    tokens: { total: 20 },
    timeZone: "America/New_York",
    period: {
      from: "2026-10-06",
      to: "2026-10-06",
      start: Date.parse("2026-10-06T04:00Z"),
      end: Date.parse("2026-10-07T04:00Z"),
    },
  });
  f.setZone("UTC");
  f.engine.client.signal({ kind: "focus" });
  await vi.waitFor(() => expect(f.states).toHaveLength(paints + 2));
  expect(f.states.at(-1)).toMatchObject({
    tokens: { total: 10 },
    address: before.address,
    timeZone: "UTC",
  });
  expect(f.server.requests).toBe(2);
});

it.each(["visibility", "paused"] as const)(
  "freezes range clocks and copies while %s, then catches up both in one paint",
  async (kind) => {
    const f = rangeFixture(
      [rangeStep(Date.parse("2026-10-07T18:00Z"), 10)],
      "2026-10-07T18:14:59Z",
      "Asia/Kathmandu",
    );
    await f.request({ kind: "preset", preset: "today" });
    await vi.waitFor(() => expect(f.server.streams).toBe(1));
    f.engine.client.signal(
      kind === "visibility" ? { kind, visible: false } : { kind, paused: true },
    );
    await vi.waitFor(() => expect(f.clock.ticking).toBe(0));
    const paints = f.states.length;
    const requests = f.server.requests;
    f.server.commit(
      syntheticCopy([rangeStep(Date.parse("2026-10-07T18:16Z"), 20)], { revision: 2 }),
    );
    f.setZone("Australia/Adelaide");
    await f.clock.advance(120);
    f.engine.client.signal({ kind: "focus" });
    await Promise.resolve();
    expect(f.states).toHaveLength(paints);
    expect(f.server.requests).toBe(requests);
    if (kind === "paused") {
      const paused = await f.request({ kind: "preset", preset: "today" });
      expect(paused).toMatchObject({
        paused: true,
        statusLine: "Paused at 23:59",
        timeZone: "Asia/Kathmandu",
        period: { to: "2026-10-07", end: Date.parse("2026-10-07T18:14:59Z") },
        tokens: { total: 10 },
      });
    }
    const beforeResume = f.states.length;
    f.engine.client.signal(
      kind === "visibility" ? { kind, visible: true } : { kind, paused: false },
    );
    await vi.waitFor(() =>
      expect(f.states.at(-1)).toMatchObject({
        paused: false,
        revision: 2,
        timeZone: "Australia/Adelaide",
        period: { to: "2026-10-08" },
        tokens: { total: 20 },
      }),
    );
    expect(f.states).toHaveLength(beforeResume + 1);
  },
);

it("reads the current clock on focus and range input even inside the same minute", async () => {
  const f = rangeFixture([], "2026-10-07T14:02:00Z");
  await f.request({ kind: "preset", preset: "today" });
  await f.clock.advance(0.5);
  const focused = f.states.length;
  f.engine.client.signal({ kind: "focus" });
  await vi.waitFor(() => expect(f.states).toHaveLength(focused + 1));
  expect(f.states.at(-1)).toMatchObject({
    period: { end: Date.parse("2026-10-07T14:02:00.500Z") },
  });
  await f.clock.advance(0.1);
  expect((await f.request({ kind: "preset", preset: "7d" })).period.end).toBe(
    Date.parse("2026-10-07T14:02:00.600Z"),
  );
});

it("never converts a fixed bookmark into a live preset after travel onto its local dates", async () => {
  const f = rangeFixture([], "2026-10-07T02:00Z");
  const fixed = await f.request({
    kind: "address",
    address: "/?range=fixed&from=2026-10-06&to=2026-10-06",
  });
  f.setZone("America/New_York");
  f.engine.client.signal({ kind: "focus" });
  await vi.waitFor(() => expect(f.states.at(-1)).toMatchObject({ timeZone: "America/New_York" }));
  expect(f.states.at(-1)).toMatchObject({
    address: fixed.address,
    range: { fixedLabel: "6 Oct 2026 – 6 Oct 2026" },
    period: { from: "2026-10-06", to: "2026-10-06" },
  });
});

it.each([
  ["fr-FR", "7 Oct 2026", "14:02"],
  ["en-US", "Oct 7 2026", "2:02 PM"],
  ["fr-CA", "7 Oct 2026", "14:02"],
] as const)(
  "uses %s region order and clock, with English month names",
  async (locale, date, time) => {
    const f = rangeFixture(
      [
        rangeStep(Date.parse("2026-09-01")),
        rangeStep(Date.parse("2026-10-06T12:00Z"), 100),
        rangeStep(Date.parse("2026-10-07T12:00Z"), 90),
      ],
      undefined,
      undefined,
      locale,
    );
    const today = await f.request({ kind: "preset", preset: "today" });
    expect(today.comparison.tokens).toBe("↓ 10%");
    expect(today.comparison.caption).toContain(`through ${time}`);
    const fixed = await f.request({
      kind: "address",
      address: "/?range=fixed&from=2026-10-07&to=2026-10-09",
    });
    expect(fixed.range.fixedLabel).toContain(date);
    f.engine.client.signal({ kind: "paused", paused: true });
    await vi.waitFor(() =>
      expect(f.states.at(-1)).toMatchObject({ statusLine: `Paused at ${time}` }),
    );
  },
);
