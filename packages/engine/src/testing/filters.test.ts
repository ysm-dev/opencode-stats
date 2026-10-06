import { expect, it, vi } from "vitest";
import * as fc from "fast-check";
import { mapSessionFields } from "@opencode-stats/browser-copy";
import { syntheticCopy, propertyParameters } from "@opencode-stats/browser-copy/testing";
import { rangeFixture } from "./range-fixture.ts";
import { filterSteps, filterMetadata, filterNames, filterSessions } from "./filter-fixture.ts";
import { referenceFilters } from "./filter-reference.ts";
import { filterDimensions } from "../filters.ts";

it("keeps equal model labels distinct by permanent ID, including zero-token and out-of-range checklist values", async () => {
  const f = rangeFixture(
    [{ ...filterSteps[0]!, input: 0, model: 8 }],
    undefined,
    undefined,
    undefined,
    {
      ...filterMetadata,
      names: [
        { dimension: "model", code: 8, id: "b/model", name: "Same model" },
        { dimension: "model", code: 7, id: "a/model", name: "Same model" },
      ],
    },
  );
  let state = await f.request({ kind: "all-time" });
  expect(state.checklists.find((list) => list.dimension === "model")!.values).toEqual([
    { id: "a/model", name: "Same model", tokens: 0, proportion: 0, selected: false },
    { id: "b/model", name: "Same model", tokens: 0, proportion: 0, selected: false },
  ]);
  state = await f.request({ kind: "filter", dimension: "model", id: "a/model" });
  expect(state.sessions.total).toBe(0);
  state = await f.request({ kind: "preset", preset: "today" });
  expect(
    state.checklists
      .flatMap((list) => list.values)
      .every((value) => value.tokens === 0 && value.proportion === 0),
  ).toBe(true);
});

it("combines any-of values and all-of dimensions, ignores only each checklist's own ticks, and never fetches for filters", async () => {
  const f = rangeFixture(filterSteps, undefined, undefined, undefined, filterMetadata);
  await f.request({ kind: "all-time" });
  await vi.waitFor(() => expect(f.server.streams).toBe(1));
  const requests = f.server.requests;
  const filters = [
    { dimension: "model", id: "provider-0/model-0" },
    { dimension: "model", id: "provider-1/model-1" },
    { dimension: "agent", id: "build" },
  ] as const;
  let state = await f.request({ kind: "filter", ...filters[0] });
  expect(state.announcement).toBe("");
  expect(
    state.checklists
      .find((list) => list.dimension === "model")!
      .values.map((value) => value.tokens),
  ).toEqual([770, 660, 550, 440, 330, 220, 110]);
  for (const filter of filters.slice(1)) state = await f.request({ kind: "filter", ...filter });
  const reference = referenceFilters(
    filterSteps,
    filterNames,
    filters,
    state.period,
    filterSessions,
  );
  expect(state.tokens).toEqual(reference.tokens);
  expect(state.sessions).toEqual(reference.sessions);
  for (const amount of reference.amounts)
    expect(
      state.checklists
        .find((list) => list.dimension === amount.dimension)!
        .values.find((value) => value.id === amount.id)!.tokens,
    ).toBe(amount.tokens);
  expect(state.tokens.total).toBe(210);
  expect(state.address).toBe(
    "/?range=all&f.model=provider-0%2Fmodel-0&f.model=provider-1%2Fmodel-1&f.agent=build",
  );
  expect(f.server.requests).toBe(requests);
  state = await f.request({ kind: "clear-filters" });
  expect(state.filterAnnouncement).toBe("Filters cleared");
  expect(state.filters).toEqual([]);
  expect(state.tokens.total).toBe(3080);
});

it("restores permanent IDs, deduplicates selections, retains unknown raw IDs, and keeps filters across every range action", async () => {
  const f = rangeFixture(filterSteps, undefined, undefined, undefined, filterMetadata);
  let state = await f.request({
    kind: "address",
    address:
      "/?range=today&f.session=deleted%2Bsession&f.session=deleted%2Bsession&f.model=unknown&f.tool=read",
  });
  expect(state.filters).toEqual([
    { dimension: "model", id: "unknown", name: "unknown" },
    { dimension: "session", id: "deleted+session", name: "deleted+session" },
  ]);
  expect(state.tokens.total).toBe(0);
  expect(state.sessions).toEqual({ total: 0, subagents: 0 });
  expect(state.address).not.toContain("f.tool");
  for (const action of [
    { kind: "shift", direction: -1 },
    { kind: "preset", preset: "7d" },
    { kind: "all-time" },
  ] as const) {
    state = await f.request(action);
    expect(state.filters).toHaveLength(2);
    expect(state.tokens.total).toBe(0);
  }
  state = await f.request({ kind: "filter", dimension: "model", id: "unknown", announce: true });
  expect(state.filterAnnouncement).toBe("Filter removed: model unknown");
  state = await f.request({ kind: "filter", dimension: "session", id: "deleted+session" });
  state = await f.request({
    kind: "filter",
    dimension: "session",
    id: "session-root",
    announce: true,
  });
  expect(state.filterAnnouncement).toBe("Filter added: session Synthetic session");
  expect(state.tokens.total).toBe(3080);
  expect((await f.request({ kind: "address", address: "/?range=all" })).filters).toEqual([]);
});

it("places sessions at the first matching step in all history, reuses that placement across ranges, and respects all dimensions", async () => {
  const f = rangeFixture(filterSteps, undefined, undefined, undefined, filterMetadata);
  let state = await f.request({ kind: "preset", preset: "today" });
  expect(state.sessions).toEqual({ total: 0, subagents: 0 });
  state = await f.request({ kind: "filter", dimension: "model", id: "provider-0/model-0" });
  state = await f.request({ kind: "filter", dimension: "variant", id: "high" });
  expect(state.sessions).toEqual({ total: 1, subagents: 0 });
  expect(state.tokens.total).toBe(100);
  expect((await f.request({ kind: "preset", preset: "30d" })).sessions.total).toBe(1);
  expect((await f.request({ kind: "shift", direction: -1 })).sessions.total).toBe(0);
  state = await f.request({
    kind: "address",
    address: "/?range=all&f.provider=provider-1&f.project=project-1&f.agent=build",
  });
  expect(state.tokens.total).toBe(0);
});

it("counts only a nested subagent's own matching steps while its root rolls up all descendants, independently of the range", async () => {
  const rows = [
    { ...filterSteps[0]!, start: Date.parse("2026-10-01T12:00Z"), subagent: 201 },
    { ...filterSteps[1]!, start: Date.parse("2026-10-07T12:00Z"), subagent: 202 },
  ];
  const sessions = [
    filterSessions[0]!,
    filterSessions[1]!,
    { code: 202, parent: 201, session: 200, project: 100, fork: null },
    { code: 203, parent: 202, session: 200, project: 100, fork: null },
  ];
  const metadata = {
    ...filterMetadata,
    sessions: mapSessionFields((field) =>
      Float64Array.from(sessions, (session) => session[field] ?? NaN),
    ),
  };
  const f = rangeFixture(rows, undefined, undefined, undefined, metadata);
  let state = await f.request({ kind: "preset", preset: "today" });
  expect(state.sessions).toEqual({ total: 0, subagents: 1 });
  const selected = { dimension: "model", id: "provider-1/model-1" } as const;
  state = await f.request({ kind: "filter", ...selected });
  // R → A → B → empty C: only B used this model. R includes B; A and C do not.
  expect(state.sessions).toEqual({ total: 1, subagents: 1 });
  const reference = referenceFilters(rows, filterNames, [selected], state.period, sessions);
  expect(reference.sessions).toEqual({ total: 1, subagents: 1 });
  expect(state.tokens.total).toBe(20);
  expect((await f.request({ kind: "all-time" })).sessions).toEqual({ total: 1, subagents: 1 });
  state = await f.request({ kind: "address", address: "/?range=all" });
  expect(state.sessions).toEqual({ total: 1, subagents: 2 });
  state = await f.request({
    kind: "address",
    address: "/?range=fixed&from=2026-10-01&to=2026-10-01&f.model=provider-1%2Fmodel-1",
  });
  expect(state.sessions).toEqual({ total: 0, subagents: 0 });
});

it("makes explicit removal idempotent without disturbing other values or dimensions", async () => {
  const f = rangeFixture(filterSteps, undefined, undefined, undefined, filterMetadata);
  await f.request({
    kind: "address",
    address: "/?range=all&f.model=provider-0%2Fmodel-6&f.model=provider-1%2Fmodel-5&f.agent=build",
  });
  const removal = {
    kind: "remove-filter",
    dimension: "model",
    id: "provider-0/model-6",
    announce: true,
  } as const;
  const first = await f.request(removal);
  const second = await f.request(removal);
  expect(second).toEqual(first);
  expect(second.tokens.total).toBe(600);
  expect(second.filters).toEqual([
    { dimension: "model", id: "provider-1/model-5", name: "Model 5" },
    { dimension: "agent", id: "build", name: "build" },
  ]);
  expect(second.filterAnnouncement).toBe("Filter removed: model Model 6");
  expect((await f.request({ ...removal, announce: false })).filterAnnouncement).toBe("");
});

it("keeps selections stable across incremental recoding, deleted metadata and a replacement generation", async () => {
  const f = rangeFixture(filterSteps, undefined, undefined, undefined, filterMetadata);
  await f.request({
    kind: "address",
    address: "/?range=all&f.project=project-0&f.session=session-root",
  });
  await vi.waitFor(() => expect(f.server.streams).toBe(1));
  f.server.commit(
    syntheticCopy(filterSteps, {
      ...filterMetadata,
      revision: 2,
      sessions: {
        code: new Float64Array([201]),
        session: new Float64Array([200]),
        parent: new Float64Array([200]),
        project: new Float64Array([100]),
        fork: new Float64Array([NaN]),
      },
      projects: new Float64Array([101]),
    }),
  );
  await vi.waitFor(() =>
    expect(f.states.at(-1)).toMatchObject({
      revision: 2,
      tokens: { total: 0 },
      filters: [{ name: "project-0" }, { name: "session-root" }],
    }),
  );
  f.server.commit(
    syntheticCopy(
      filterSteps.map((step) => ({
        ...step,
        project: step.project + 10,
        session: step.session + 10,
        subagent: step.subagent === null ? null : step.subagent + 10,
      })),
      {
        ...filterMetadata,
        generation: "11234567-89ab-cdef-0123-456789abcdef",
        revision: 1,
        names: filterNames.map((name) =>
          name.dimension === "project" || name.dimension === "session"
            ? { ...name, code: name.code + 10 }
            : name,
        ),
        projects: new Float64Array([110, 111]),
        sessions: mapSessionFields((field) =>
          Float64Array.from(filterSessions, (session) => {
            const value = session[field];
            return value === null ? NaN : value + 10;
          }),
        ),
      },
    ),
  );
  await vi.waitFor(() =>
    expect(f.states.at(-1)).toMatchObject({
      generation: "11234567-89ab-cdef-0123-456789abcdef",
      tokens: { total: 1360 },
      filters: [{ name: "Project 0" }, { name: "Synthetic session" }],
    }),
  );
});

it("equals the independent row reference for arbitrary multi-dimension combinations and full/partial local days", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(
        fc.record({
          index: fc.integer({ min: 0, max: 13 }),
          input: fc.integer({ min: 0, max: 10000 }),
          cacheRead: fc.option(fc.integer({ min: 0, max: 10000 }), { nil: null }),
          cacheWrite: fc.integer({ min: 0, max: 10000 }),
          output: fc.integer({ min: 0, max: 10000 }),
          reasoning: fc.integer({ min: 0, max: 10000 }),
        }),
        { maxLength: 35 },
      ),
      fc.subarray(filterNames),
      fc.boolean(),
      async (generated, selected, fixed) => {
        const rows = generated.map(({ index, ...tokens }) => ({
          ...filterSteps[index]!,
          ...tokens,
        }));
        const f = rangeFixture(rows, undefined, "America/New_York", undefined, filterMetadata);
        const params = new URLSearchParams({ range: fixed ? "fixed" : "30d" });
        if (fixed) {
          params.set("from", "2026-10-01");
          params.set("to", "2026-10-01");
        }
        const filters = filterDimensions.flatMap((dimension) =>
          selected
            .filter((name) => name.dimension === dimension)
            .map((name) => ({ dimension, id: name.id })),
        );
        for (const filter of filters) params.append(`f.${filter.dimension}`, filter.id);
        const state = await f.request({ kind: "address", address: `/?${params}` });
        const reference = referenceFilters(
          rows,
          filterNames,
          filters,
          state.period,
          filterSessions,
        );
        expect(state.tokens).toEqual(reference.tokens);
        expect(state.sessions).toEqual(reference.sessions);
        for (const amount of reference.amounts) {
          const value = state.checklists
            .find((list) => list.dimension === amount.dimension)!
            .values.find((candidate) => candidate.id === amount.id)!;
          expect(value.tokens).toBe(amount.tokens);
          expect(value.proportion).toBeGreaterThanOrEqual(0);
          expect(value.proportion).toBeLessThanOrEqual(1);
        }
        await f.engine.dispose();
        await f.server.dispose();
      },
    ),
    propertyParameters,
  );
});
