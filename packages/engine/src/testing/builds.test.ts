import { expect, it, vi } from "vitest";
import { mapPromptFields } from "@opencode-stats/browser-copy";
import { syntheticCopy } from "@opencode-stats/browser-copy/testing";
import { rangeFixture, rangeStep } from "./range-fixture.ts";

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
  const finished = Promise.withResolvers<void>();
  const stop = f.engine.client.subscribe((state, timing) => {
    if (state.screen === "dashboard" && state.revision === 4) {
      expect(state).toMatchObject({
        historyComplete: true,
        statusLine: "",
        tokens: { total: 105 },
      });
      expect(timing.kind).toBe("build");
      finished.resolve();
    }
  });
  f.server.commit(syntheticCopy(steps, { revision: 4 }));
  await finished.promise;
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
  expect(await f.request({ kind: "preset", preset: "30d" })).toMatchObject({
    historyStart: cutoff,
    tokens: { total: 2 },
    metrics: { steps: 1, prompts: 1, stepsPerPrompt: 1 },
    comparison: { tokens: "", steps: "" },
    summary: expect.stringContaining("since"),
  });
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
