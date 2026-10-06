import { expect, it, vi } from "vitest";
import { syntheticCopy } from "@opencode-stats/browser-copy/testing";
import { rangeFixture, rangeStep } from "./range-fixture.ts";
import { referenceMetrics } from "./metrics-reference.ts";

const step = (
  date: string,
  input: number,
  estimatedCost: number | null,
  recordedCost: number | null = 0,
) => ({
  ...rangeStep(Date.parse(date), input),
  cacheRead: 0,
  estimatedCost,
  recordedCost,
});
it("sums estimated and recorded cost separately, counts free tariffs as priced, and weights coverage by all five token kinds", async () => {
  const rows = [
    step("2026-10-01T12:00Z", 1, 99),
    step("2026-10-06T12:00Z", 10, 1, 7),
    {
      ...step("2026-10-07T12:00Z", 10, 2, 3),
      output: 10,
      reasoning: 10,
      cacheRead: 10,
      cacheWrite: 10,
    },
    step("2026-10-07T12:01Z", 25, 0, null),
    step("2026-10-07T12:02Z", 25, null, 4),
    { ...step("2026-10-07T12:03Z", 0, null, null), input: null },
  ];
  await using f = rangeFixture(rows);
  const state = await f.request({ kind: "preset", preset: "today" });
  expect(state.metrics.cost).toEqual({ estimated: 2, recorded: 7, pricedShare: 0.75 });
  expect(state.metrics.cost).toEqual(referenceMetrics(rows, [], [], [], state.period).cost);
  expect(state.comparison.cost).toBe("↑ 100%");
  const all = await f.request({ kind: "all-time" });
  expect(all.metrics.cost.estimated).toBe(102);
  expect(all.comparison.cost).toBe("");
  await vi.waitFor(() => expect(f.server.streams).toBe(1));
  f.server.commit(
    syntheticCopy(
      rows.map((row) => ({ ...row, estimatedCost: null })),
      { revision: 2 },
    ),
  );
  await vi.waitFor(() =>
    expect(f.states.at(-1)).toMatchObject({
      revision: 2,
      metrics: { cost: { estimated: null, recorded: 14, pricedShare: 0 } },
    }),
  );
});

it.each([null, 0])(
  "hides comparisons from an unpriced or zero-valued previous period (%s)",
  async (previous) => {
    await using f = rangeFixture([
      step("2026-10-01T12:00Z", 1, 1),
      step("2026-10-06T12:00Z", 100, previous),
      step("2026-10-07T12:00Z", 100, 2),
    ]);
    expect((await f.request({ kind: "preset", preset: "today" })).comparison.cost).toBe("");
  },
);

it("distinguishes a priced zero-token step from an absent estimate without inventing a priced share", async () => {
  await using f = rangeFixture([step("2026-10-07T12:00Z", 0, 0)]);
  expect((await f.request({ kind: "all-time" })).metrics.cost).toEqual({
    estimated: 0,
    recorded: 0,
    pricedShare: null,
  });
  f.server.commit(syntheticCopy([], { revision: 2 }));
  await vi.waitFor(() =>
    expect(f.states.at(-1)).toMatchObject({
      metrics: { cost: { estimated: null, recorded: 0, pricedShare: null } },
    }),
  );
});
