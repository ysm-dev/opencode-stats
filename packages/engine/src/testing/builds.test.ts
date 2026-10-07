import { expect, it, vi, onTestFinished } from "vitest";
import { mapPromptFields } from "@opencode-stats/browser-copy";
import { syntheticCopy, inMemoryDashboardServer } from "@opencode-stats/browser-copy/testing";
import { rangeFixture, rangeStep, type CompleteState } from "./range-fixture.ts";
import { inThreadEngine, manualClock, blockedSlices } from "./index.ts";
import type { ChangeTime } from "../index.ts";

const today = Date.parse("2026-10-07T00:00Z");
const steps = [
  { ...rangeStep(today - 86400000, 100), session: 1, streamEnd: today - 86400000 + 20 },
  { ...rangeStep(today + 1000, 2), session: 1 },
  { ...rangeStep(today + 2000, 3), session: 2 },
];

it("a load stays blank through copies and clock ticks until the build covers today", async () => {
  await using f = rangeFixture(steps, undefined, undefined, undefined, {
    historyComplete: false,
    historyCompleteFrom: today + 1000,
  });
  const loaded = f.request({ kind: "all-time" });
  await vi.waitFor(() => expect(f.server.streams).toBe(1));
  f.server.commit(
    syntheticCopy(steps, {
      revision: 2,
      historyComplete: false,
      historyCompleteFrom: today + 500,
    }),
  );
  await vi.waitFor(() => expect(f.server.requests).toBe(3));
  await f.clock.advance(60);
  expect(f.states).toEqual([]);
  f.server.commit(
    syntheticCopy(steps, {
      revision: 3,
      historyComplete: false,
      historyCompleteFrom: today,
    }),
  );
  expect(await loaded).toMatchObject({
    historyStart: today,
    historyComplete: false,
    tokens: { total: 5 },
    sessions: { total: 1 },
    metrics: { steps: 2, response: { recordedFrom: null } },
    statusLine: "History from 7 Oct · older history is still being read",
    announcement: "",
  });
  const finished = Promise.withResolvers<{ state: CompleteState; kind: ChangeTime["kind"] }>();
  const stop = f.engine.client.subscribe((state, timing) => {
    if (state.screen === "dashboard" && state.revision === 4) {
      finished.resolve({ state, kind: timing.kind });
    }
  });
  f.server.commit(syntheticCopy(steps, { revision: 4 }));
  const { state, kind } = await finished.promise;
  expect(state).toMatchObject({ historyComplete: true, statusLine: "", tokens: { total: 105 } });
  expect(kind).toBe("build");
  stop();
});

it.each([
  ["UTC", "2026-10-06T00:00:00Z", "2026-10-06T00:00:00Z"],
  ["UTC", "2026-10-05T23:59:59.999Z", "2026-10-06T00:00:00Z"],
  ["America/New_York", "2026-03-08T05:00:00.001Z", "2026-03-09T04:00:00Z"],
  ["America/New_York", "2026-11-01T04:00:00.001Z", "2026-11-02T05:00:00Z"],
])("counts from the first local midnight at or after %s %s", async (zone, boundary, expected) => {
  const cutoff = Date.parse(expected);
  const facts = [rangeStep(cutoff - 1, 100), rangeStep(cutoff, 2)];
  await using f = rangeFixture(facts, new Date(cutoff + 3600000).toISOString(), zone, "en-US", {
    historyComplete: false,
    historyCompleteFrom: Date.parse(boundary),
    promptIds: ["before", "after"],
    prompts: mapPromptFields((field) =>
      field === "start" ? new Float64Array([cutoff - 1, cutoff]) : new Float64Array([NaN, NaN]),
    ),
  });
  const state = await f.request({ kind: "preset", preset: "30d" });
  expect(state).toMatchObject({
    historyStart: cutoff,
    tokens: { total: 2 },
    metrics: { steps: 1, prompts: 1, stepsPerPrompt: 1 },
    comparison: { tokens: "", steps: "" },
  });
  expect(state.summary.includes("since")).toBe(true);
});

it("an open tab keeps the old generation and focused filters until its fresh copy covers today", async () => {
  await using f = rangeFixture(steps);
  const old = await f.request({ kind: "all-time" });
  await vi.waitFor(() => expect(f.server.streams).toBe(1));
  const generation = "11234567-89ab-cdef-0123-456789abcdef";
  const next = [rangeStep(today + 1000, 8)];
  const requests = f.server.requests;
  f.server.commit(
    syntheticCopy(next, {
      generation,
      revision: 2,
      historyComplete: false,
      historyCompleteFrom: today + 1,
    }),
  );
  await vi.waitFor(() => expect(f.server.requests).toBeGreaterThan(requests));
  expect(await f.request({ kind: "all-time" })).toMatchObject({
    generation: old.generation,
    tokens: old.tokens,
  });
  const filtered = await f.request({ kind: "filter", dimension: "model", id: "missing" });
  expect(filtered.tokens.total).toBe(0);
  await f.clock.advance(60);
  expect(f.states.at(-1)).toMatchObject({ generation: old.generation });
  f.server.commit(
    syntheticCopy(next, {
      generation,
      revision: 3,
      historyComplete: false,
      historyCompleteFrom: today,
    }),
  );
  await vi.waitFor(() =>
    expect(f.states.at(-1)).toMatchObject({
      generation,
      revision: 3,
      tokens: { total: 0 },
      filters: [{ id: "missing" }],
    }),
  );
  expect((await f.request({ kind: "clear-filters" })).tokens.total).toBe(8);
});

it("an empty database makes All time Today, additive zeroes and missing rates and percentiles", async () => {
  await using f = rangeFixture();
  expect(await f.request({ kind: "all-time" })).toMatchObject({
    historyStart: today,
    historyComplete: true,
    period: { from: "2026-10-07", days: 1 },
    statusLine: "",
    tokens: { total: 0 },
    sessions: { total: 0, subagents: 0 },
    metrics: {
      steps: 0,
      prompts: 0,
      failed: 0,
      interrupted: 0,
      stepsPerPrompt: null,
      failureRate: null,
      cacheHitRate: null,
      response: { p50: null, p95: null, timedShare: null, recordedFrom: null },
      context: { median: null, p95: null, max: null },
    },
  });
});

it("a fixed range after the start of history describes its dates, not an incomplete earlier span", async () => {
  await using f = rangeFixture(steps);
  const state = await f.request({
    kind: "address",
    address: "/?range=fixed&from=2026-10-07&to=2026-10-07",
  });
  expect(state.summary).toBe("You ran 2 steps across 1 sessions from 7 Oct 2026 – 7 Oct 2026.");
});

it("a partial build is muted and silent, while pause and a lost server retain their own announcements", async () => {
  await using f = rangeFixture(steps, undefined, undefined, undefined, {
    historyComplete: false,
    historyCompleteFrom: today,
  });
  await f.request({ kind: "all-time" });
  f.engine.client.signal({ kind: "paused", paused: true });
  await vi.waitFor(() =>
    expect(f.states.at(-1)).toMatchObject({ statusLine: "Paused at 14:02", paused: true }),
  );
  f.engine.client.signal({ kind: "paused", paused: false });
  await vi.waitFor(() =>
    expect(f.states.at(-1)).toMatchObject({
      statusLine: "History from 7 Oct · older history is still being read",
      paused: false,
    }),
  );
  await vi.waitFor(() => expect(f.server.streams).toBe(1));
  await f.server.drop();
  await f.clock.advance(5);
  expect(f.states.at(-1)).toMatchObject({
    statusLine:
      "History from 7 Oct · not updating since 14:02 · the dashboard server isn't running",
    liveLabel: "Not updating",
  });
});

it("a load that loses its server before today is complete leaves the wait for a problem screen, then recovers", async () => {
  await using f = rangeFixture(steps, undefined, undefined, undefined, {
    historyComplete: false,
    historyCompleteFrom: today + 1,
  });
  const loaded = f.engine.client.request({ kind: "all-time" });
  await vi.waitFor(() => expect(f.server.streams).toBe(1));
  await f.server.drop();
  await f.clock.advance(5);
  expect(await loaded).toMatchObject({
    kind: "paint",
    state: { screen: "problem", reason: "copy-unavailable" },
  });
  f.server.commit(syntheticCopy(steps, { revision: 2 }));
  f.server.resume();
  f.engine.client.signal({ kind: "focus" });
  await vi.waitFor(() =>
    expect(f.states.at(-1)).toMatchObject({ screen: "dashboard", revision: 2 }),
  );
});

const beforeMidnight = "2026-10-07T23:59:59Z";
const tomorrow = today + 86400000;
const incomplete = { historyComplete: false, historyCompleteFrom: today + 43200000 };

it("an initial load becomes today-ready at midnight without another copy or request", async () => {
  await using f = rangeFixture(steps, beforeMidnight, "UTC", "en-GB", incomplete);
  const loaded = f.request({ kind: "all-time" });
  await vi.waitFor(() => expect(f.server.streams).toBe(1));
  expect(f.states).toEqual([]);
  const requests = f.server.requests;
  await f.clock.advance(2);
  expect(await loaded).toMatchObject({
    revision: 1,
    historyStart: tomorrow,
    period: { from: "2026-10-08" },
    tokens: { total: 0 },
    statusLine: "History from 8 Oct · older history is still being read",
  });
  expect(f.server.requests).toBe(requests);
});

it("a staged generation replaces the old visible copy at midnight without another copy or request", async () => {
  await using f = rangeFixture(steps, beforeMidnight);
  const old = await f.request({ kind: "all-time" });
  await vi.waitFor(() => expect(f.server.streams).toBe(1));
  const generation = "11234567-89ab-cdef-0123-456789abcdef";
  f.server.commit(syntheticCopy(steps, { ...incomplete, generation, revision: 2 }));
  await vi.waitFor(() => expect(f.server.requests).toBe(3));
  await f.clock.advance(0);
  expect(await f.request({ kind: "all-time" })).toMatchObject({
    generation: old.generation,
    revision: 1,
  });
  const requests = f.server.requests;
  await f.clock.advance(2);
  expect(f.states.at(-1)).toMatchObject({
    generation,
    revision: 2,
    historyStart: tomorrow,
    period: { from: "2026-10-08" },
    tokens: { total: 0 },
  });
  expect(f.server.requests).toBe(requests);
});

it.each(["paused", "hidden"])(
  "a staged generation does not move with the clock while %s",
  async (mode) => {
    await using f = rangeFixture(steps, beforeMidnight);
    const old = await f.request({ kind: "all-time" });
    await vi.waitFor(() => expect(f.server.streams).toBe(1));
    const generation = "11234567-89ab-cdef-0123-456789abcdef";
    f.server.commit(syntheticCopy(steps, { ...incomplete, generation, revision: 2 }));
    await vi.waitFor(() => expect(f.server.requests).toBe(3));
    await f.clock.advance(0);
    f.engine.client.signal(
      mode === "paused" ? { kind: "paused", paused: true } : { kind: "visibility", visible: false },
    );
    await vi.waitFor(() => expect(f.server.streams).toBe(0));
    const count = f.states.length;
    await f.clock.advance(2);
    f.engine.client.signal({ kind: "focus" });
    await f.clock.advance(0);
    expect(f.states).toHaveLength(count);
    expect(f.states.at(-1)).toMatchObject({
      generation: old.generation,
      revision: 1,
      period: { to: "2026-10-07" },
    });
    f.engine.client.signal(
      mode === "paused" ? { kind: "paused", paused: false } : { kind: "visibility", visible: true },
    );
    await vi.waitFor(() =>
      expect(f.states.at(-1)).toMatchObject({
        generation,
        revision: 2,
        period: { from: "2026-10-08" },
        paused: false,
      }),
    );
  },
);

it("midnight never promotes a generation whose first whole copy is still being applied", async () => {
  const clock = manualClock(Date.parse(beforeMidnight));
  const slices = blockedSlices();
  let blocked = false;
  const server = inMemoryDashboardServer(syntheticCopy(steps));
  const engine = inThreadEngine(server.fetch, queueMicrotask, {
    ...clock,
    workNow: () => (blocked ? slices.clock.workNow() : 0),
    yield: slices.clock.yield,
  });
  onTestFinished(async () => {
    slices.release();
    await engine.dispose();
    await server.dispose();
  });
  await engine.client.request({ kind: "all-time" });
  await vi.waitFor(() => expect(server.streams).toBe(1));
  blocked = true;
  const generation = "11234567-89ab-cdef-0123-456789abcdef";
  server.commit(syntheticCopy(steps, { ...incomplete, generation, revision: 2 }));
  await slices.entered;
  await clock.advance(2);
  expect(await engine.client.request({ kind: "all-time" })).toMatchObject({
    state: { revision: 1, tokens: { total: 105 }, period: { to: "2026-10-08" } },
  });
  slices.release();
  await vi.waitFor(async () =>
    expect(await engine.client.request({ kind: "all-time" })).toMatchObject({
      state: { generation, revision: 2, historyStart: tomorrow, tokens: { total: 0 } },
    }),
  );
});
