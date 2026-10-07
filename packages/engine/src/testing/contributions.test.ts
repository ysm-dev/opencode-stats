import { expect, it, vi } from "vitest";
import { profileEngine } from "./profile.ts";
import { assert, asyncProperty, constantFrom, array, record, integer, option } from "fast-check";
import { syntheticCopy, propertyParameters } from "@opencode-stats/browser-copy/testing";
import { rangeFixture, rangeStep } from "./range-fixture.ts";
import { referenceContributions } from "./contribution-reference.ts";
import { referenceAdd, referenceMidnight } from "./time-reference.ts";
import { calendarRange, type CalendarUnit, type EngineAction } from "../index.ts";

const graphSelection = (date: string, unit: CalendarUnit): EngineAction => {
  const { from, to } = calendarRange(date, unit);
  return { kind: "drill", from, to, unit, source: "graph" };
};

const steps = (date: string, input = 1, estimatedCost: number | null = 1) => ({
  ...rangeStep(Date.parse(`${date}T12:00Z`), input),
  estimatedCost,
  recordedCost: input / 2,
});
it("shows exactly 365 local days, ranks zero-usage active days, ignores the range, and retains all-history streaks", async () => {
  const rows = [
    ...Array.from({ length: 10 }, (_, index) => steps(referenceAdd("2024-01-01", index))),
    steps("2026-10-02", 0, 0),
    steps("2026-10-03", 10),
    steps("2026-10-04", 20, null),
    steps("2026-10-05", 30, 3),
    steps("2026-10-06", 40, 4),
    steps("2026-10-07", 50, 5),
  ];
  await using f = rangeFixture(rows);
  let state = await f.request({ kind: "preset", preset: "today" });
  expect(state.activeDays).toBe(1);
  expect(state.graph.days.map((day) => day.date)).toHaveLength(365);
  expect(state.graph.days[0]!.date).toBe("2025-10-08");
  expect(state.graph.days.at(-1)!.date).toBe("2026-10-07");
  expect(state.graph.currentStreak).toBe(6);
  expect(state.graph.longestStreak).toBe(10);
  expect(state.graph.days.filter((day) => day.steps > 0).map((day) => day.level)).toEqual([
    1, 1, 2, 3, 3, 4,
  ]);
  const graph = state.graph;
  state = await f.request({ kind: "preset", preset: "365d" });
  expect(state.graph).toEqual(graph);
  expect(state.activeDays).toBe(6);
  for (const metric of ["cost", "steps", "tokens"] as const) {
    state = await f.request({ kind: "graph-metric", metric });
    expect(state.graph).toEqual(
      referenceContributions(rows, f.clock.now(), "UTC", state.historyStart, metric),
    );
    expect(state.summary).toContain("6 steps");
  }
  const cost = await f.request({ kind: "graph-metric", metric: "cost" });
  expect(cost.graph.days.find((day) => day.date === "2026-10-02")).toMatchObject({
    level: 1,
    cost: { estimated: 0, pricedShare: null },
  });
  expect(cost.graph.days.find((day) => day.date === "2026-10-04")).toMatchObject({
    level: -1,
    cost: { estimated: null, pricedShare: 0 },
  });
});

it("filters graph and all-history streaks, including unknown filters, but a tool filter never narrows steps", async () => {
  await using f = rangeFixture(
    [
      steps("2026-10-01"),
      steps("2026-10-02"),
      steps("2026-10-06"),
      { ...steps("2026-10-07"), agent: 2 },
    ],
    undefined,
    undefined,
    undefined,
    { names: [{ dimension: "agent", code: 2, id: "only-today", name: "Only today" }] },
  );
  let state = await f.request({ kind: "preset", preset: "today" });
  expect(state.graph.currentStreak).toBe(2);
  state = await f.request({ kind: "filter", dimension: "tool", id: "unrecorded" });
  expect(state.activeDays).toBe(1);
  expect(state.graph.currentStreak).toBe(2);
  state = await f.request({ kind: "filter", dimension: "agent", id: "unknown" });
  expect(state.graph.days.every((day) => day.level === 0)).toBe(true);
  expect(state.graph.currentStreak).toBe(0);
  expect(state.graph.longestStreak).toBe(0);
  state = await f.request({ kind: "clear-filters" });
  const agent = state.checklists
    .find((list) => list.dimension === "agent")!
    .values.find((value) => value.tokens > 0)!;
  state = await f.request({ kind: "filter", dimension: "agent", id: agent.id });
  expect(state.graph.currentStreak).toBe(1);
});

it("counts active days within the previous period's exact running cut, not merely its local date labels", async () => {
  await using f = rangeFixture([
    steps("2026-10-01"),
    { ...steps("2026-10-06"), start: Date.parse("2026-10-06T18:00Z") },
    steps("2026-10-07"),
  ]);
  const state = await f.request({ kind: "preset", preset: "today" });
  expect(state.activeDays).toBe(1);
  expect(state.comparison.activeDays).toBe("");
  expect(state.graph.currentStreak).toBe(2);
});

it("keeps yesterday's current streak until today starts, regardless of the selected range", async () => {
  await using f = rangeFixture([steps("2026-10-04"), steps("2026-10-05"), steps("2026-10-06")]);
  const today = await f.request({ kind: "preset", preset: "today" });
  expect(today.activeDays).toBe(0);
  expect(today.graph.currentStreak).toBe(3);
  const fixed = await f.request(graphSelection("2026-10-04", "day"));
  expect(fixed.activeDays).toBe(1);
  expect(fixed.graph.currentStreak).toBe(3);
  expect(fixed.graph.longestStreak).toBe(3);
});

it("starts streaks at complete history, empties earlier cells, and follows live repricing, deletes and the timezone", async () => {
  const rows = [steps("2026-10-02"), steps("2026-10-03"), steps("2026-10-04"), steps("2026-10-05")];
  await using f = rangeFixture(rows, undefined, undefined, undefined, {
    historyComplete: false,
    historyCompleteFrom: Date.parse("2026-10-03T12:00Z"),
  });
  const state = await f.request({ kind: "graph-metric", metric: "cost" });
  expect(state.historyStart).toBe(Date.parse("2026-10-04T00:00Z"));
  expect(state.graph.longestStreak).toBe(2);
  expect(state.graph.currentStreak).toBe(0);
  expect(state.graph.days.find((day) => day.date === "2026-10-03")!.level).toBe(0);
  const emptyDay = await f.request(graphSelection("2026-10-02", "day"));
  expect(emptyDay.activeDays).toBe(0);
  expect(emptyDay.summary).toContain("0 steps");
  expect(emptyDay.summary).not.toContain("since");
  await vi.waitFor(() => expect(f.server.streams).toBe(1));
  f.server.commit(
    syntheticCopy([{ ...steps("2026-10-05", 2, 0) }], {
      revision: 2,
      fromRevision: 1,
      tombstones: ["step-0", "step-1", "step-2", "step-3"],
      ids: ["priced"],
      historyComplete: true,
    }),
  );
  await vi.waitFor(() =>
    expect(f.states.at(-1)).toMatchObject({ revision: 2, graph: { longestStreak: 1 } }),
  );
  const next = await f.request({ kind: "all-time" });
  expect(next.graph.days.find((day) => day.date === "2026-10-05")).toMatchObject({
    tokens: 2,
    cost: { estimated: 0 },
    level: 1,
  });
  f.setZone("Pacific/Kiritimati");
  const shifted = await f.request({ kind: "all-time" });
  expect(shifted.graph.days.at(-1)!.date).toBe("2026-10-08");
  expect(shifted.graph.days.find((day) => day.date === "2026-10-06")!.steps).toBe(1);
});

it("restores metric choices, omits the default, and rejects malformed or duplicate graph parameters", async () => {
  await using f = rangeFixture();
  expect((await f.request({ kind: "address", address: "/?range=all&graph=steps" })).address).toBe(
    "/?range=all&graph=steps",
  );
  expect((await f.request({ kind: "graph-metric", metric: "tokens" })).address).toBe("/?range=all");
  for (const address of ["/?graph=bad", "/?graph=cost&graph=steps"]) {
    expect(await f.engine.client.request({ kind: "address", address })).toMatchObject({
      kind: "paint",
      state: { screen: "problem", reason: "invalid-address" },
    });
    expect(await f.engine.client.request({ kind: "graph-metric", metric: "cost" })).toMatchObject({
      state: { screen: "problem" },
    });
  }
});

it("keeps a genuinely free day exactly zero after incremental paid steps are removed", async () => {
  const rows = [
    steps("2026-10-05", 10, 0),
    steps("2026-10-05", 10, 0.1),
    steps("2026-10-05", 10, 0.2),
  ];
  await using f = rangeFixture(rows);
  await f.request({ kind: "graph-metric", metric: "cost" });
  await vi.waitFor(() => expect(f.server.streams).toBe(1));
  f.server.commit(syntheticCopy([rows[0]!], { revision: 2 }));
  await vi.waitFor(() => expect(f.states.at(-1)).toMatchObject({ revision: 2 }));
  const state = await f.request({ kind: "all-time" });
  expect(state.graph.days.find((day) => day.date === "2026-10-05")).toMatchObject({
    steps: 1,
    level: 1,
    cost: { estimated: 0, pricedShare: 1 },
  });
});

it("selects calendar days, Monday weeks and whole months, preserves shift kind through URLs, and normalizes presets", async () => {
  await using f = rangeFixture([steps("2026-01-01")]);
  const today = await f.request(graphSelection("2026-10-07", "day"));
  expect(today.address).toBe("/?range=today");
  expect(today.selectionAnnouncement).toBe("Today");
  const week = await f.request(graphSelection("2026-10-01", "week"));
  expect(week.period).toMatchObject({ from: "2026-09-28", to: "2026-10-04", days: 7 });
  expect((await f.request({ kind: "shift", direction: -1 })).period).toMatchObject({
    from: "2026-09-21",
    to: "2026-09-27",
  });
  const month = await f.request(graphSelection("2026-09-12", "month"));
  expect(month.address).toContain("kind=month");
  await f.request({ kind: "address", address: month.address });
  expect((await f.request({ kind: "shift", direction: -1 })).period).toMatchObject({
    from: "2026-08-01",
    to: "2026-08-31",
    days: 31,
  });
  expect((await f.request({ kind: "shift", direction: 1 })).period).toMatchObject({
    from: "2026-09-01",
    to: "2026-09-30",
    days: 30,
  });
  const running = await f.request({ kind: "shift", direction: 1 });
  expect(running.period).toMatchObject({ from: "2026-10-01", to: "2026-10-31", days: 31 });
  expect((await f.request({ kind: "shift", direction: 1 })).address).toBe(running.address);
  for (const address of [
    "/?range=fixed&from=2026-10-02&to=2026-10-31&kind=month",
    "/?range=fixed&from=2026-10-01&to=2026-10-02&kind=day",
    "/?range=today&kind=day",
    "/?range=fixed&from=2026-10-01&to=2026-10-01&kind=day&kind=week",
  ]) {
    expect(await f.engine.client.request({ kind: "address", address })).toMatchObject({
      state: { screen: "problem" },
    });
  }
  expect(
    await f.engine.client.request({
      kind: "drill",
      from: "not-a-day",
      to: "not-a-day",
      unit: "day",
      source: "graph",
    }),
  ).toMatchObject({ state: { screen: "problem" } });
});

it.each([
  {
    unit: "month",
    now: "2026-09-30T14:02Z",
    date: "2026-09-15",
    preset: "30d",
    beforeFrom: "2026-08-02",
    beforeTo: "2026-08-31",
  },
  {
    unit: "week",
    now: "2026-10-04T14:02Z",
    date: "2026-10-01",
    preset: "7d",
    beforeFrom: "2026-09-21",
    beforeTo: "2026-09-27",
  },
] as const)(
  "normalizes a $unit selection matching a preset and shifts the normalized span",
  async ({ unit, now, date, preset, beforeFrom, beforeTo }) => {
    await using f = rangeFixture([steps("2026-01-01")], now);
    const selected = await f.request(graphSelection(date, unit));
    expect(selected.address).toBe(`/?range=${preset}`);
    await f.request({ kind: "address", address: selected.address });
    const before = await f.request({ kind: "shift", direction: -1 });
    expect(before.period).toMatchObject({ from: beforeFrom, to: beforeTo });
    const returned = await f.request({ kind: "shift", direction: 1 });
    expect(returned.address).toBe(selected.address);
    expect((await f.request({ kind: "shift", direction: -1 })).address).toBe(before.address);
  },
);

it("preserves independently owned chart choices across graph metric, range, filter and shared drill actions", async () => {
  await using f = rangeFixture();
  const state = await f.request({
    kind: "address",
    address: "/?range=all&metric=steps&split=model&graph=cost",
  });
  expect(state.address).toContain("metric=steps&split=model&graph=cost");
  expect(state.chart.metric).toBe("steps");
  expect(state.chart.split).toBe("model");
  expect(state.graph.metric).toBe("cost");
  for (const action of [
    { kind: "graph-metric", metric: "steps" },
    { kind: "preset", preset: "today" },
    { kind: "filter", dimension: "agent", id: "unknown" },
    { kind: "drill", from: "2026-10-01", to: "2026-10-01", unit: "day" },
  ] as const) {
    const next = await f.request(action);
    expect(next.address).toContain("metric=steps&split=model&graph=steps");
    expect(next.chart.metric).toBe("steps");
    expect(next.chart.split).toBe("model");
    expect(next.graph.metric).toBe("steps");
  }
  const changedChart = await f.request({ kind: "chart-metric", metric: "tokens" });
  expect(changedChart.graph.metric).toBe("steps");
  expect(changedChart.address).toContain("split=model&graph=steps");
  const changedSplit = await f.request({ kind: "chart-split", split: "provider" });
  expect(changedSplit.graph.metric).toBe("steps");
  expect(changedSplit.address).toContain("split=provider&graph=steps");
  const restored = await f.request({ kind: "address", address: changedSplit.address });
  expect(restored.chart.metric).toBe("tokens");
  expect(restored.chart.split).toBe("provider");
  expect(restored.graph.metric).toBe("steps");
});

profileEngine();
it("matches an independent contribution reference over sparse local calendars, prices and filters", async () => {
  await assert(
    asyncProperty(
      constantFrom("UTC", "America/New_York", "Australia/Lord_Howe", "Asia/Kathmandu"),
      array(
        record({
          ago: integer({ min: 0, max: 420 }),
          input: integer({ min: 0, max: 100 }),
          price: option(integer({ min: 0, max: 10 }), { nil: null }),
          agent: integer({ min: 0, max: 1 }),
        }),
        { maxLength: 20 },
      ),
      async (zone, generated) => {
        const now = Date.parse("2026-11-03T20:00Z");
        const rows = generated.map((row) => ({
          ...steps("2026-10-01", row.input, row.price),
          agent: row.agent,
          start: referenceMidnight(referenceAdd("2026-11-03", -row.ago), zone) + 3600000,
        }));
        await using f = rangeFixture(rows, new Date(now).toISOString(), zone, undefined, {
          names: [
            { dimension: "agent", code: 0, id: "agent-zero", name: "Agent zero" },
            { dimension: "agent", code: 1, id: "agent-one", name: "Agent one" },
          ],
        });
        for (const metric of ["tokens", "steps", "cost"] as const) {
          const state = await f.request({ kind: "graph-metric", metric });
          const reference = referenceContributions(rows, now, zone, state.historyStart, metric);
          expect(state.graph).toEqual(reference);
          expect(state.activeDays).toBe(
            reference.days.filter((day) => day.steps > 0 && day.date >= state.period.from).length,
          );
        }
        const filtered = await f.request({ kind: "filter", dimension: "agent", id: "agent-zero" });
        expect(filtered.graph).toEqual(
          referenceContributions(
            rows.filter((row) => row.agent === 0),
            now,
            zone,
            filtered.historyStart,
            "cost",
          ),
        );
      },
    ),
    propertyParameters,
  );
});
