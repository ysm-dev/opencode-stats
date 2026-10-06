import { expect, it, vi } from "vitest";
import * as fc from "fast-check";
import { propertyParameters, syntheticCopy } from "@opencode-stats/browser-copy/testing";
import { presets } from "../index.ts";
import { rangeFixture, rangeStep } from "./range-fixture.ts";
import {
  referenceAdd,
  referenceDate,
  referenceMidnight,
  referenceRangeTokens,
} from "./time-reference.ts";

it("opens a fresh visit on Last 30 days and preserves preset identity on reload", async () => {
  const f = rangeFixture();
  const first = await f.request({ kind: "address", address: "/" });
  expect(first).toMatchObject({
    address: "/?range=30d",
    rangeLabel: "Last 30 days",
    timeZone: "UTC",
    period: {
      from: "2026-09-08",
      to: "2026-10-07",
      days: 30,
      start: Date.parse("2026-09-08"),
      end: Date.parse("2026-10-07T14:02Z"),
    },
    comparison: { tokens: "", sessions: "", caption: "" },
    tokens: { total: 0 },
    range: { preset: "30d", fixedLabel: "", canShiftBack: true, canShiftForward: false },
  });
  const restored = await f.request({ kind: "address", address: first.address });
  expect(restored).toEqual(first);
  const all = await f.request({ kind: "all-time" });
  expect(all.period.start).toBe(Date.parse("2026-10-07"));
  expect(all.range).toEqual({
    preset: "all",
    fixedLabel: "",
    canShiftBack: false,
    canShiftForward: false,
  });
  expect(await f.request({ kind: "shift", direction: -1 })).toEqual(all);
  expect(await f.request({ kind: "shift", direction: 1 })).toEqual(all);
});

it.each(presets.filter((preset) => preset !== "all"))(
  "shifts %s by its local days, clamps the next shift and returns to the live preset",
  async (preset) => {
    const f = rangeFixture([], "2026-03-09T12:00Z", "America/New_York");
    const live = await f.request({ kind: "preset", preset });
    expect((await f.request({ kind: "shift", direction: 1 })).address).toBe(live.address);
    const fixed = await f.request({ kind: "shift", direction: -1 });
    expect(fixed.period.from).toBe(referenceAdd(live.period.from, -live.period.days));
    expect(fixed.period.to).toBe(referenceAdd(live.period.to, -live.period.days));
    expect(fixed.period.start).toBe(referenceMidnight(fixed.period.from, "America/New_York"));
    expect(fixed.period.end).toBe(
      referenceMidnight(referenceAdd(fixed.period.to, 1), "America/New_York"),
    );
    expect(fixed.range).toMatchObject({ preset, canShiftBack: true, canShiftForward: true });
    expect(await f.request({ kind: "address", address: fixed.address })).toEqual(fixed);
    expect((await f.request({ kind: "shift", direction: 1 })).address).toBe(live.address);
  },
);

it("compares the same elapsed portion, hides pre-history periods and never derives a percentage from zero", async () => {
  const f = rangeFixture([
    rangeStep(Date.parse("2026-10-01")),
    rangeStep(Date.parse("2026-10-06T12:00Z"), 100),
    rangeStep(Date.parse("2026-10-06T15:00Z"), 999),
    rangeStep(Date.parse("2026-10-07T13:00Z"), 112),
  ]);
  const today = await f.request({ kind: "preset", preset: "today" });
  expect(today.tokens.total).toBe(112);
  expect(today.comparison).toEqual({
    tokens: "↑ 12%",
    sessions: "",
    caption: "Previous period · 6 Oct 2026 – 6 Oct 2026 · through 14:02",
  });
  expect((await f.request({ kind: "preset", preset: "7d" })).comparison.caption).toBe("");
  expect((await f.request({ kind: "all-time" })).comparison).toEqual({
    tokens: "",
    sessions: "",
    caption: "",
  });
  const back = await f.request({
    kind: "address",
    address: "/?range=fixed&from=2026-10-06&to=2026-10-06",
  });
  expect(back.comparison.tokens).toBe("");
  expect(back.comparison.caption).toContain("5 Oct 2026");
  const emptyHistory = await f.request({
    kind: "address",
    address: "/?range=fixed&from=2026-10-01&to=2026-10-01",
  });
  expect(emptyHistory.comparison.caption).toBe("");
});

it("clamps elapsed comparisons at the previous DST day's own end", async () => {
  const f = rangeFixture(
    [
      rangeStep(Date.parse("2026-03-01")),
      rangeStep(Date.parse("2026-03-08T04:59Z"), 100),
      rangeStep(Date.parse("2026-03-09T03:59Z"), 10),
      rangeStep(Date.parse("2026-03-09T04:00Z"), 50),
    ],
    "2026-03-10T03:45Z",
    "America/New_York",
  );
  const state = await f.request({ kind: "preset", preset: "today" });
  expect(state.period.from).toBe("2026-03-09");
  expect(state.comparison.tokens).toBe("↑ 400%");
  expect(state.comparison.caption).toContain("through 00:00");
});

it("compares complete fixed days with the complete previous day even when DST makes their durations differ", async () => {
  const f = rangeFixture(
    [
      rangeStep(Date.parse("2026-10-01")),
      rangeStep(Date.parse("2026-11-02T04:30Z"), 100),
      rangeStep(Date.parse("2026-11-02T12:00Z"), 103),
    ],
    "2026-11-03T12:00Z",
    "America/New_York",
  );
  const state = await f.request({
    kind: "address",
    address: "/?range=fixed&from=2026-11-02&to=2026-11-02",
  });
  expect(state.comparison.tokens).toBe("↑ 3%");
  expect(state.comparison.caption).toContain("1 Nov 2026");
});

it("allows a fixed range spanning today while disallowing a shift whose start is after today", async () => {
  const f = rangeFixture([rangeStep(Date.parse("2026-10-01"))]);
  const state = await f.request({
    kind: "address",
    address: "/?range=fixed&from=2026-10-06&to=2026-10-09",
  });
  expect(state.period.end).toBe(Date.parse("2026-10-07T14:02Z"));
  expect(state.range.canShiftForward).toBe(false);
  expect(state.range.preset).toBe("30d");
  expect(await f.request({ kind: "shift", direction: 1 })).toEqual(state);
});

it("can shift a non-preset span onto today even when its end falls in the future", async () => {
  const f = rangeFixture();
  await f.request({ kind: "address", address: "/?range=fixed&from=2026-10-03&to=2026-10-06" });
  const state = await f.request({ kind: "shift", direction: 1 });
  expect(state).toMatchObject({
    address: "/?range=fixed&from=2026-10-07&to=2026-10-10",
    period: { from: "2026-10-07", to: "2026-10-10", end: Date.parse("2026-10-07T14:02Z") },
    range: { canShiftForward: false },
  });
});

it.each([
  [966, "↓ 3.4%"],
  [0, "↓ 100%"],
] as const)(
  "formats a %i-token headline comparison without colour semantics",
  async (input, expected) => {
    const f = rangeFixture([
      rangeStep(Date.parse("2026-10-01")),
      rangeStep(Date.parse("2026-10-06T12:00Z"), 1000),
      rangeStep(Date.parse("2026-10-07T12:00Z"), input),
    ]);
    expect((await f.request({ kind: "preset", preset: "today" })).comparison.tokens).toBe(expected);
  },
);

it("places sessions across all history, never at their first step in the selected range", async () => {
  const f = rangeFixture(
    [
      { ...rangeStep(Date.parse("2026-10-01")), session: 1, subagent: 2 },
      { ...rangeStep(Date.parse("2026-10-07T12:00Z")), session: 1, subagent: 2 },
      { ...rangeStep(Date.parse("2026-10-07T13:00Z")), session: 3 },
    ],
    undefined,
    undefined,
    undefined,
    {
      sessions: {
        code: new Float64Array([1, 2, 3]),
        parent: new Float64Array([NaN, 1, NaN]),
        session: new Float64Array([1, 1, 3]),
        project: new Float64Array([0, 0, 0]),
        fork: new Float64Array([NaN, NaN, NaN]),
      },
    },
  );
  expect((await f.request({ kind: "preset", preset: "today" })).sessions).toEqual({
    total: 1,
    subagents: 0,
  });
  expect((await f.request({ kind: "all-time" })).sessions).toEqual({ total: 2, subagents: 1 });
  expect(
    (await f.request({ kind: "address", address: "/?range=fixed&from=2026-10-01&to=2026-10-01" }))
      .sessions,
  ).toEqual({ total: 1, subagents: 1 });
});

it("adds full local days by occurring dimension combination and repairs rewrites and deletions", async () => {
  const first = Date.parse("2026-10-01T10:00Z");
  const rows = [
    rangeStep(first, 10),
    rangeStep(first + 1, 20),
    { ...rangeStep(first + 2, 30), model: 1 },
    rangeStep(Date.parse("2026-10-07T10:00Z"), 40),
  ];
  const f = rangeFixture(rows, undefined, "Asia/Kathmandu");
  expect((await f.request({ kind: "preset", preset: "7d" })).tokens.total).toBe(100);
  await vi.waitFor(() => expect(f.server.streams).toBe(1));
  const final = [{ ...rows[0]!, model: 2, input: 11 }, rows[3]!];
  f.server.commit(syntheticCopy(final, { revision: 2, ids: ["step-0", "step-3"] }));
  await vi.waitFor(() =>
    expect(f.states.at(-1)).toMatchObject({ revision: 2, tokens: { total: 51 } }),
  );
  f.server.commit(syntheticCopy([], { revision: 3 }));
  await vi.waitFor(() =>
    expect(f.states.at(-1)).toMatchObject({ revision: 3, tokens: { total: 0 } }),
  );
  expect((await f.request({ kind: "all-time" })).period.start).toBe(
    referenceMidnight("2026-10-07", "Asia/Kathmandu"),
  );
});

it("matches a row-oriented range reference for each preset and generated IANA zone", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.constantFrom(...Intl.supportedValuesOf("timeZone")),
      fc.array(
        fc.record({
          hours: fc.integer({ min: -10000, max: 48 }),
          input: fc.integer({ min: 0, max: 100000 }),
          model: fc.integer({ min: 0, max: 3 }),
        }),
        { maxLength: 25 },
      ),
      async (zone, facts) => {
        const now = Date.parse("2026-10-07T14:02Z");
        const rows = facts.map(({ hours, input, model }) => ({
          ...rangeStep(now + hours * 3600000, input),
          model,
        }));
        const f = rangeFixture(rows, undefined, zone);
        for (const preset of presets) {
          const state = await f.request({ kind: "preset", preset });
          const days = preset === "today" ? 1 : Number.parseInt(preset);
          const today = referenceDate(now, zone);
          const start =
            preset === "all"
              ? Math.min(...rows.map((row) => row.start), referenceMidnight(today, zone))
              : referenceMidnight(referenceAdd(today, 1 - days), zone);
          // All time's first activity is not rounded down; an empty copy starts today.
          const history = rows.length ? Math.min(...rows.map((row) => row.start)) : start;
          expect(state.period.start).toBe(preset === "all" ? history : start);
          expect(state.tokens).toEqual(referenceRangeTokens(rows, state.period.start, now));
          const shifted = await f.request({ kind: "shift", direction: -1 });
          const previousStart =
            preset === "all"
              ? state.period.start
              : referenceMidnight(referenceAdd(state.period.from, -days), zone);
          const previousEnd =
            preset === "all" ? state.period.end : referenceMidnight(state.period.from, zone);
          expect(shifted.period).toMatchObject({ start: previousStart, end: previousEnd });
          expect(shifted.tokens).toEqual(referenceRangeTokens(rows, previousStart, previousEnd));
          expect((await f.request({ kind: "shift", direction: 1 })).address).toBe(state.address);
        }
        await f.engine.dispose();
        await f.server.dispose();
      },
    ),
    propertyParameters,
  );
});

it.each([
  "?range=nope",
  "?range=30d&range=today",
  "?range=fixed&from=2026-02-30&to=2026-03-01",
  "?range=fixed&from=oops&to=2026-03-01",
  "?range=fixed&from=2026-01-01",
  "?range=fixed&from=2026-10-08&to=2026-10-07",
  "?range=all&from=2026-01-01",
  "?range=fixed&from=2026-01-01&from=2026-02-01&to=2026-03-01",
])("rejects malformed range addresses %s at the channel boundary", async (address) => {
  const f = rangeFixture();
  expect(await f.engine.client.request({ kind: "address", address: `/${address}` })).toEqual({
    kind: "paint",
    state: { screen: "problem", reason: "invalid-address" },
  });
  expect((await f.request({ kind: "shift", direction: -1 })).range.fixedLabel).not.toBe("");
});
