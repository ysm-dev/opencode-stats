import { expect, it, vi } from "vitest";
import fc from "fast-check";
import { rangeFixture, rangeStep, type CompleteState } from "./testing/range-fixture.ts";
import { filterSteps, filterMetadata, filterCopy } from "./testing/filter-fixture.ts";
import { metricSteps } from "./testing/metrics-fixture.ts";
import { toolCopy } from "./testing/tool-fixture.ts";
import { chartMetrics, chartSplits } from "./index.ts";
import { referenceTokens } from "./testing/chart-reference.ts";
import { referenceMidnight, referenceAdd, referenceHours } from "./testing/time-reference.ts";
import { propertyParameters, syntheticCopy } from "@opencode-stats/browser-copy/testing";
const drillAction = (state: CompleteState, index: number) => {
  const unit = state.chart.unit;
  if (unit === "hour") throw new Error("Hours do not drill");
  const bucket = state.chart.buckets[index]!;
  return { kind: "drill" as const, from: bucket.from, to: bucket.to, unit };
};

it.each([
  ["today", "hour", 24],
  ["7d", "day", 7],
  ["30d", "day", 30],
  ["90d", "day", 90],
  ["180d", "week", 27],
  ["365d", "week", 53],
] as const)("%s chooses calendar %s buckets over the entire axis", async (preset, unit, count) => {
  await using f = rangeFixture();
  const state = await f.request({ kind: "preset", preset });
  expect(state.chart.unit).toBe(unit);
  expect(state.chart.buckets).toHaveLength(count);
  expect(state.chart.total).toBe(state.tokens.total);
  expect(state.chart.buckets.at(-1)!.partial).toBe(true);
  expect(state.chart.buckets.at(-1)!.axisEnd).toBeGreaterThan(state.period.end);
  if (unit === "hour") {
    expect(
      state.chart.buckets
        .slice(15)
        .every((bucket) => bucket.total === 0 && bucket.start === bucket.end),
    ).toBe(true);
  }
});

it("All time follows unfiltered history, clips edge buckets, and retains empty axes", async () => {
  await using f = rangeFixture(filterSteps, undefined, undefined, undefined, filterMetadata);
  const all = await f.request({ kind: "all-time" });
  const chart = all.chart;
  expect(chart.unit).toBe("day");
  expect(chart.buckets[0]!.start).toBe(Date.parse("2026-10-01T12:00Z"));
  expect(chart.buckets[0]!.partial).toBe(true);
  const filtered = await f.request({ kind: "filter", dimension: "model", id: "not-recorded" });
  expect(filtered.chart.buckets.map((bucket) => bucket.axisStart)).toEqual(
    chart.buckets.map((bucket) => bucket.axisStart),
  );
  expect(filtered.chart.total).toBe(0);
  expect(filtered.chart.buckets.every((bucket) => bucket.total === 0)).toBe(true);
  await using empty = rangeFixture();
  const today = await empty.request({ kind: "all-time" });
  expect(today.chart.unit).toBe("hour");
  expect(today.chart.buckets).toHaveLength(24);
});

it("charts share the build's active history seam without dropping the preset's empty axis or counting a partial historic day", async () => {
  await using f = rangeFixture(filterSteps, undefined, undefined, undefined, {
    ...filterMetadata,
    historyComplete: false,
    historyCompleteFrom: Date.parse("2026-10-01T12:00Z"),
  });
  let state = await f.request({ kind: "preset", preset: "7d" });
  expect(state.historyStart).toBe(Date.parse("2026-10-02T00:00Z"));
  expect(state.chart.buckets).toHaveLength(7);
  expect(state.chart.buckets[0]!.axisStart).toBe(Date.parse("2026-10-01T00:00Z"));
  expect(state.chart.buckets[0]!.total).toBe(0);
  expect(state.chart.total).toBe(state.tokens.total);
  expect(state.chart.total).toBe(2800);
  state = await f.request({ kind: "chart-metric", metric: "steps" });
  expect(state.chart.total).toBe(state.metrics.steps);
  expect(state.chart.total).toBe(7);
  f.server.commit({ ...filterCopy(), revision: 2 });
  await vi.waitFor(() => {
    const last = f.states.at(-1);
    expect(last?.screen === "dashboard" && last.historyComplete).toBe(true);
  });
  state = await f.request({ kind: "chart-metric", metric: "tokens" });
  expect(state.historyComplete).toBe(true);
  expect(state.chart.total).toBe(3080);
  expect(state.chart.total).toBe(state.tokens.total);
  f.server.commit(syntheticCopy([], { generation: "01234567-89ab-cdef-0123-456789abcdee" }));
  await vi.waitFor(() => {
    const last = f.states.at(-1);
    expect(last?.screen === "dashboard" && last.generation).toBe(
      "01234567-89ab-cdef-0123-456789abcdee",
    );
  });
  state = await f.request({ kind: "chart-metric", metric: "steps" });
  expect(state.chart.total).toBe(0);
  expect(state.chart.total).toBe(state.metrics.steps);
});

it("ranks range series once and folds beyond six in every bucket without losing totals", async () => {
  await using f = rangeFixture(filterSteps, undefined, undefined, undefined, filterMetadata);
  await f.request({ kind: "all-time" });
  const state = await f.request({ kind: "chart-split", split: "model" });
  expect(state.chart.series.map((series) => series.name)).toEqual([
    "Model 6",
    "Model 5",
    "Model 4",
    "Model 3",
    "Model 2",
    "Model 1",
    "1 more",
  ]);
  expect(state.chart.series.at(-1)!.total).toBe(110);
  expect(state.chart.series.reduce((sum, series) => sum + series.total!, 0)).toBe(
    state.tokens.total,
  );
  expect(
    state.chart.buckets.map((bucket) => bucket.values.reduce((sum, value) => sum! + value!, 0)),
  ).toEqual(state.chart.buckets.map((bucket) => bucket.total));
  await f.request({ kind: "filter", dimension: "model", id: "provider-0/model-0" });
  const one = await f.request({ kind: "chart-split", split: "model" });
  expect(one.chart.series).toEqual([
    { id: "model:provider-0/model-0", name: "Model 0", total: 110 },
  ]);
});

it("every metric reuses headline arithmetic, and only additive metrics split", async () => {
  const steps = metricSteps.map((step, index) => ({
    ...step,
    estimatedCost: index % 2 ? index / 10 : null,
    recordedCost: index / 100,
  }));
  await using f = rangeFixture(steps, undefined, undefined, undefined, toolCopy());
  await f.request({ kind: "preset", preset: "7d" });
  for (const metric of chartMetrics) {
    const state = await f.request({ kind: "chart-metric", metric });
    const expected = {
      tokens: state.tokens.total,
      cost: state.metrics.cost.estimated,
      "recorded-cost": state.metrics.cost.recorded,
      steps: state.metrics.steps,
      prompts: state.metrics.prompts,
      tools: state.tools.calls,
      sessions: state.sessions.total,
      cache: state.metrics.cacheHitRate,
      response: state.metrics.response.p50,
    }[metric];
    expect(state.chart.total).toBe(expected);
    for (const split of chartSplits) {
      const drawn = await f.request({ kind: "chart-split", split });
      expect(drawn.chart.total).toBe(expected);
      if (["sessions", "cache", "response"].includes(metric)) {
        expect(drawn.chart.additive).toBe(false);
        expect(drawn.chart.series).toHaveLength(1);
      } else {
        expect(drawn.chart.additive).toBe(true);
        expect(
          drawn.chart.buckets.reduce((sum, bucket) => sum + (bucket.total ?? 0), 0),
        ).toBeCloseTo(expected ?? 0);
      }
    }
    if (metric === "cost") expect(state.chart.basis).toContain("of tokens priced");
    if (metric === "response") expect(state.chart.basis).toContain("of steps timed");
  }
});

it("drills Monday weeks and calendar months to days, shifts by kind and restores its address", async () => {
  await using f = rangeFixture([rangeStep(Date.parse("2024-01-15T12:00Z"))]);
  let state = await f.request({ kind: "all-time" });
  expect(state.chart.unit).toBe("month");
  state = await f.request(drillAction(state, 1));
  expect(state.period.from).toBe("2024-02-01");
  expect(state.period.to).toBe("2024-02-29");
  expect(state.chart.unit).toBe("day");
  state = await f.request({ kind: "shift", direction: 1 });
  expect(state.period.from).toBe("2024-03-01");
  expect(state.period.to).toBe("2024-03-31");
  expect((await f.request({ kind: "address", address: state.address })).address).toBe(
    state.address,
  );
  expect((await f.request({ kind: "shift", direction: -1 })).period.to).toBe("2024-02-29");
  state = await f.request({ kind: "preset", preset: "180d" });
  state = await f.request(drillAction(state, 1));
  expect(state.period.days).toBe(7);
  expect(new Date(state.period.start).getUTCDay()).toBe(1);
  expect(state.chart.unit).toBe("day");
  state = await f.request({ kind: "shift", direction: -1 });
  expect(state.period.days).toBe(7);
  state = await f.request(drillAction(state, 3));
  expect(state.chart.unit).toBe("hour");
  expect(state.period.days).toBe(1);
  expect(state.chart.buckets.every((bucket) => !bucket.partial)).toBe(true);
});

it.each([
  "metric=no",
  "metric=steps&metric=steps",
  "split=no",
  "split=model&split=model",
  "range=fixed&from=2026-01-01&to=2026-01-02&kind=no",
  "range=today&kind=day",
  "range=fixed&from=2026-01-01&to=2026-01-02&kind=day",
  "range=fixed&from=2026-01-01&to=2026-01-02&kind=week",
  "range=fixed&from=2026-01-01&to=2026-01-07&kind=week",
  "range=fixed&from=2026-01-01&to=2026-01-02&kind=month",
  "range=fixed&from=2026-01-02&to=2026-01-31&kind=month",
])("rejects bad bookmark %s at the public channel", async (query) => {
  await using f = rangeFixture();
  const result = await f.engine.client.request({ kind: "address", address: `/?${query}` });
  expect(result.kind === "paint" && result.state).toEqual({
    screen: "problem",
    reason: "invalid-address",
  });
});

it("bookmarked week kind remains Monday-first and calendar-sized on a shift", async () => {
  await using f = rangeFixture();
  const state = await f.request({
    kind: "address",
    address: "/?range=fixed&from=2026-09-28&to=2026-10-04&kind=week",
  });
  expect(state.period.days).toBe(7);
  expect((await f.request({ kind: "shift", direction: -1 })).period.from).toBe("2026-09-21");
});

it("drilling carries the dates actually drawn, rather than an index in a newer worker answer", async () => {
  await using f = rangeFixture();
  const drawn = await f.request({ kind: "preset", preset: "30d" });
  await f.request({ kind: "preset", preset: "7d" });
  const state = await f.request(drillAction(drawn, 0));
  expect(state.period.from).toBe("2026-09-08");
  expect(state.period.days).toBe(1);
  const bad = await f.engine.client.request({
    kind: "drill",
    from: "not-a-date",
    to: "2026-01-01",
    unit: "day",
  });
  expect(bad.kind === "paint" && bad.state).toEqual({
    screen: "problem",
    reason: "invalid-address",
  });
});

it("a non-token metric defaults to model rather than inventing token-kind prices or counts", async () => {
  await using f = rangeFixture(filterSteps, undefined, undefined, undefined, filterMetadata);
  const state = await f.request({ kind: "address", address: "/?range=7d&metric=steps" });
  expect(state.chart.split).toBe("model");
  expect(state.chart.name).toBe("Steps by model");
  expect(state.address).toBe("/?range=7d&metric=steps&split=model");
});

it("an unpriced remainder stays missing instead of becoming a zero estimate, and reserved-looking dimension IDs stay distinct", async () => {
  const names = filterMetadata.names.map((name) =>
    name.dimension === "model" && name.code === 0 ? { ...name, id: "more" } : name,
  );
  await using f = rangeFixture(filterSteps, undefined, undefined, undefined, {
    ...filterMetadata,
    names,
  });
  await f.request({ kind: "all-time" });
  await f.request({ kind: "chart-split", split: "model" });
  const state = await f.request({ kind: "chart-metric", metric: "cost" });
  expect(state.chart.series).toHaveLength(7);
  expect(state.chart.series.at(-1)!.total).toBeNull();
  expect(state.chart.buckets[0]!.values.at(-1)).toBeNull();
  expect(state.chart.total).toBeNull();
  const tokens = await f.request({ kind: "chart-metric", metric: "tokens" });
  expect(tokens.chart.total).toBe(tokens.tokens.total);
  expect(new Set(tokens.chart.series.map((series) => series.id)).size).toBe(7);
});

it("omits default choices and preserves both choices across filters, drills, shifts and reloads", async () => {
  await using f = rangeFixture();
  let state = await f.request({ kind: "address", address: "/?metric=steps&split=provider" });
  expect(state.chart.metric).toBe("steps");
  expect(state.chart.split).toBe("provider");
  state = await f.request({ kind: "filter", dimension: "model", id: "raw/id" });
  state = await f.request({ kind: "shift", direction: -1 });
  state = await f.request(drillAction(state, 0));
  expect(state.address).toContain("metric=steps&split=provider");
  const restored = await f.request({ kind: "address", address: state.address });
  expect(restored.chart).toEqual({ ...state.chart, announcement: "" });
  await f.request({ kind: "chart-metric", metric: "tokens" });
  state = await f.request({ kind: "chart-split", split: "token-kind" });
  expect(state.address).not.toMatch(/metric=|split=/);
});

it("synthetic UTC reference agrees for arbitrary facts on boundaries and missing tokens", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(
        fc.record({
          minute: fc.integer({ min: -1440, max: 10080 }),
          tokens: fc.integer({ min: 0, max: 100000 }),
          missing: fc.boolean(),
        }),
        { maxLength: 40 },
      ),
      async (values) => {
        const steps = values.map(({ minute, tokens, missing }) => ({
          ...metricSteps[0]!,
          start: Date.parse("2026-10-01T00:00Z") + minute * 60000,
          input: missing ? null : tokens,
        }));
        await using f = rangeFixture(steps, undefined, undefined, undefined, {
          ...toolCopy(),
          ids: steps.map((_, i) => `property-${i}`),
        });
        const state = await f.request({ kind: "preset", preset: "7d" });
        expect(state.chart.buckets.map((bucket) => bucket.total)).toEqual(
          referenceTokens(steps, state),
        );
        expect(state.chart.buckets.reduce((sum, bucket) => sum + bucket.total!, 0)).toBe(
          state.tokens.total,
        );
      },
    ),
    propertyParameters,
  );
});

it.each([
  ["America/New_York", "2026-03-08", 23],
  ["Europe/London", "2026-10-25", 25],
  ["Australia/Lord_Howe", "2026-04-05", 25],
  ["Pacific/Chatham", "2026-04-05", 26],
  ["Asia/Kathmandu", "2026-10-07", 24],
  ["America/Santiago", "2026-09-06", 23],
] as const)(
  "chart keeps real %s %s hours, repeated offsets and fractional partials",
  async (zone, date, count) => {
    const start = referenceMidnight(date, zone);
    const end = referenceMidnight(referenceAdd(date, 1), zone);
    const hours = referenceHours(start, end, zone);
    const steps = hours.map((hour) => rangeStep(hour.start, 1));
    await using f = rangeFixture(steps, new Date(end + 60000).toISOString(), zone);
    const state = await f.request({
      kind: "address",
      address: `/?range=fixed&from=${date}&to=${date}`,
    });
    expect(state.chart.buckets).toHaveLength(count);
    expect(
      state.chart.buckets.map(({ start: from, end: to }) => ({ start: from, end: to })),
    ).toEqual(hours);
    expect(state.chart.buckets.every((bucket) => bucket.total === 1)).toBe(true);
    expect(state.chart.buckets.map((bucket) => bucket.partial)).toEqual(
      hours.map((hour) => hour.end - hour.start !== 3600000),
    );
    expect(new Set(state.chart.buckets.map((bucket) => bucket.title)).size).toBe(count);
  },
);
