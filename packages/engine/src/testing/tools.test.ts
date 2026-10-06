import { expect, it, vi } from "vitest";
import * as fc from "fast-check";
import {
  propertyParameters,
  syntheticCopy,
  inMemoryDashboardServer,
} from "@opencode-stats/browser-copy/testing";
import {
  decode,
  mapToolFields,
  mapStepDimensions,
  type ToolCall,
} from "@opencode-stats/browser-copy";
import { rangeFixture } from "./range-fixture.ts";
import { toolCopy, toolCalls, toolNames } from "./tool-fixture.ts";
import { referenceTools } from "./tool-reference.ts";
import { filterSteps, filterMetadata } from "./filter-fixture.ts";
import { metricSteps } from "./metrics-fixture.ts";
import { blockedSlices, manualClock, inThreadEngine } from "./index.ts";

it("computes per-tool exact nearest ranks, outcome denominators and the share of completed calls timed", async () => {
  const copy = toolCopy();
  await using f = rangeFixture(metricSteps, undefined, undefined, undefined, copy);
  const state = await f.request({ kind: "preset", preset: "today" });
  expect(state.tools).toEqual(referenceTools(toolCalls, copy.names, [], state.period));
  expect(state.tools).toMatchObject({
    calls: 11,
    succeeded: 6,
    failed: 2,
    stopped: 2,
    pending: 1,
    failureRate: 0.25,
  });
  expect(state.tools.rows.find((row) => row.id === "read")).toMatchObject({
    calls: 5,
    succeeded: 4,
    failed: 1,
    failureRate: 0.2,
    runTime: { p50: 10, p95: 1000, timedShare: 0.8 },
  });
  expect(state.tools.rows.find((row) => row.id === "execute")).toMatchObject({
    failureRate: null,
    runTime: { p50: null, p95: null, timedShare: 0 },
  });
  expect(state.comparison.tools).toBe("↑ 1,000%");
});

it("filters only calls, uses any-of tool ticks, and excludes those ticks from its own checklist amounts", async () => {
  const copy = toolCopy();
  await using f = rangeFixture(metricSteps, undefined, undefined, undefined, copy);
  const first = await f.request({ kind: "preset", preset: "today" });
  const read = await f.request({ kind: "filter", dimension: "tool", id: "read" });
  expect(read.tools.calls).toBe(5);
  expect(read.metrics).toEqual(first.metrics);
  expect(read.tokens).toEqual(first.tokens);
  expect(read.sessions).toEqual(first.sessions);
  expect(
    read.checklists
      .find((list) => list.dimension === "tool")!
      .values.map((value) => [value.id, value.tokens]),
  ).toEqual([
    ["read", 5],
    ["shell", 2],
    ["execute", 1],
    ["plugin.custom", 1],
    ["server.lookup", 1],
    ["todowrite", 1],
  ]);
  const both = await f.request({ kind: "filter", dimension: "tool", id: "shell" });
  expect(both.tools.calls).toBe(7);
  const unknown = await f.request({ kind: "address", address: "/?range=today&f.tool=missing" });
  expect(unknown.tools).toMatchObject({
    calls: 0,
    failureRate: null,
    runTime: { p50: null, p95: null, timedShare: null },
  });
  expect(unknown.filters[0]!.name).toBe("missing");
  expect(unknown.metrics).toEqual(first.metrics);
  const project = await f.request({ kind: "filter", dimension: "project", id: "absent" });
  expect(
    project.checklists
      .find((list) => list.dimension === "tool")!
      .values.every((value) => value.tokens === 0 && value.proportion === 0),
  ).toBe(true);
  const removed = await f.request({
    kind: "remove-filter",
    dimension: "tool",
    id: "missing",
    announce: true,
  });
  const again = await f.request({
    kind: "remove-filter",
    dimension: "tool",
    id: "missing",
    announce: true,
  });
  expect(again.address).toBe(removed.address);
});

it("applies call rewrites and tombstones atomically, then replaces all calls on a fresh generation", async () => {
  const copy = toolCopy();
  await using f = rangeFixture(metricSteps, undefined, undefined, undefined, copy);
  await f.request({ kind: "all-time" });
  await vi.waitFor(() => expect(f.server.streams).toBe(1));
  f.server.commit({ ...toolCopy(toolCalls.slice(0, 2)), revision: 2 });
  await vi.waitFor(() =>
    expect(f.states.at(-1)).toMatchObject({ revision: 2, tools: { calls: 2 } }),
  );
  const running = { ...toolCalls[0]!, outcome: null, completed: null };
  f.server.commit({ ...toolCopy([running]), revision: 3 });
  await vi.waitFor(() =>
    expect(f.states.at(-1)).toMatchObject({
      revision: 3,
      tools: { calls: 1, pending: 1, runTime: { p50: null } },
    }),
  );
  f.server.commit({
    ...toolCopy([]),
    generation: "11234567-89ab-cdef-0123-456789abcdef",
    revision: 1,
  });
  await vi.waitFor(() => expect(f.states.at(-1)).toMatchObject({ tools: { calls: 0, rows: [] } }));
});

it("never publishes a partially applied call batch when a sliced apply is interrupted", async () => {
  const copy = toolCopy();
  const server = inMemoryDashboardServer(syntheticCopy([], { names: copy.names }));
  const slices = blockedSlices();
  let slicing = false;
  const engine = inThreadEngine(server.fetch, queueMicrotask, {
    ...manualClock(),
    ...slices.clock,
    workNow: () => (slicing ? slices.clock.workNow() : 0),
  });
  try {
    await engine.client.request({ kind: "all-time" });
    slicing = true;
    server.commit(
      syntheticCopy([], {
        revision: 2,
        toolIds: copy.toolIds,
        tools: copy.tools,
        names: copy.names,
      }),
    );
    await slices.entered;
    const closing = engine.dispose();
    slices.release();
    await closing;
    expect(engine.answers).toHaveLength(1);
  } finally {
    slices.release();
    await engine.dispose();
    await server.dispose();
  }
});

it("returns a problem screen for a malformed whole copy instead of hanging while looking up its tool name", async () => {
  const server = inMemoryDashboardServer(toolCopy());
  const engine = inThreadEngine(
    async (input, init) => {
      const response = await server.fetch(input, init);
      if (new URL(new Request(input, init).url).pathname !== "/api/browser-copy") return response;
      const bytes = await response.arrayBuffer();
      decode(bytes).tools.tool[0] = 999;
      return new Response(bytes, { headers: response.headers });
    },
    queueMicrotask,
    manualClock(),
  );
  try {
    expect(await engine.client.request({ kind: "all-time" })).toEqual({
      kind: "paint",
      state: { screen: "problem", reason: "copy-unavailable" },
    });
  } finally {
    await engine.dispose();
    await server.dispose();
  }
});

it("accepts a delta whose tool and step-error names were already supplied by the whole copy", async () => {
  const copy = toolCopy();
  await using f = rangeFixture(metricSteps, undefined, undefined, undefined, copy);
  const first = await f.request({ kind: "all-time" });
  await vi.waitFor(() => expect(f.server.streams).toBe(1));
  const replacement = { ...toolCopy([{ ...toolCalls[1]!, outcome: 2 }]), revision: 2 };
  f.server.respondWithChanges({
    ...replacement,
    kind: "changes",
    fromRevision: first.revision,
    names: [],
    tombstones: copy.toolIds.slice(1),
  });
  f.server.commit(replacement);
  await vi.waitFor(() =>
    expect(f.states.at(-1)).toMatchObject({ revision: 2, tools: { calls: 1, failed: 1 } }),
  );
  const next = await f.request({ kind: "all-time" });
  expect(next.tools.rows[0]).toMatchObject({ id: "read", name: "read", failed: 1 });
  expect(next.metrics.errors).toEqual(first.metrics.errors);
});

it.each(["tool", "error"] as const)(
  "rejects a delta with a dangling %s name without changing any previously complete facts or names",
  async (dimension) => {
    const copy = toolCopy();
    await using f = rangeFixture(metricSteps, undefined, undefined, undefined, copy);
    const before = await f.request({ kind: "all-time" });
    await vi.waitFor(() => expect(f.server.streams).toBe(1));
    const after = syntheticCopy(
      metricSteps.map((step) => ({
        ...step,
        input: 1000,
        error: dimension === "error" ? 999 : step.error,
        failed: dimension === "error" ? 1 : step.failed,
      })),
      {
        ...toolCopy(toolCalls.slice(0, 2)),
        revision: 2,
        names: copy.names.map((name) =>
          name.dimension === "tool" ? { ...name, name: "Changed before rejection" } : name,
        ),
      },
    );
    if (dimension === "tool") after.tools.tool[1] = 999;
    f.server.commit(after);
    await vi.waitFor(() => expect(f.server.streams).toBe(0));
    const retained = await f.request({ kind: "all-time" });
    expect(retained.revision).toBe(before.revision);
    expect(retained.tools).toEqual(before.tools);
    expect(retained.metrics).toEqual(before.metrics);
    expect(retained.tokens).toEqual(before.tokens);
    expect(retained.sessions).toEqual(before.sessions);
    expect(retained.checklists).toEqual(before.checklists);
    expect(
      f.states.every((state) => state.screen !== "dashboard" || state.revision === before.revision),
    ).toBe(true);

    const repaired = {
      ...after,
      revision: 3,
      names: [
        ...after.names,
        { dimension, code: 999, id: "new-recorded-name", name: "New recorded name" },
      ],
    };
    f.server.commit(repaired);
    await f.clock.advance(2);
    await vi.waitFor(() => expect(f.states.at(-1)).toMatchObject({ revision: 3 }));
    const recovered = await f.request({ kind: "all-time" });
    expect(recovered.tokens.total).toBeGreaterThan(before.tokens.total);
    expect(recovered.tools.calls).toBe(2);
  },
);

it("matches a straightforward reference for generated filters, ranges, missing timings and nearest ranks", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(
        fc.record({
          duration: fc.option(fc.integer({ min: 0, max: 1000 }), { nil: null }),
          outcome: fc.constantFrom(null, 1, 2, 3),
          tool: fc.integer({ min: 600, max: 605 }),
        }),
        { maxLength: 25 },
      ),
      fc.subarray(
        [...filterMetadata.names, ...toolNames].filter((name) => name.dimension !== "session"),
      ),
      fc.constantFrom("today", "7d", "all"),
      async (generated, selected, preset) => {
        const calls: ToolCall[] = generated.map((item, i) => {
          const step = filterSteps[i % filterSteps.length]!;
          return {
            ...mapStepDimensions((field) => step[field]),
            start: step.start,
            tool: item.tool,
            outcome: item.outcome,
            runStart: item.duration === null ? null : step.start,
            completed: item.duration === null ? null : step.start + item.duration,
          };
        });
        const copy = syntheticCopy(filterSteps, {
          ...filterMetadata,
          names: [...filterMetadata.names, ...toolNames],
          toolIds: calls.map((_, i) => `tool:${i}`),
          tools: mapToolFields((field) => Float64Array.from(calls, (call) => call[field] ?? NaN)),
        });
        await using f = rangeFixture(filterSteps, undefined, undefined, undefined, copy);
        const filters = selected.flatMap((name) =>
          name.dimension === "project" ||
          name.dimension === "provider" ||
          name.dimension === "model" ||
          name.dimension === "variant" ||
          name.dimension === "agent" ||
          name.dimension === "tool"
            ? [{ dimension: name.dimension, id: name.id }]
            : [],
        );
        const params = new URLSearchParams({ range: preset });
        for (const filter of filters) params.append(`f.${filter.dimension}`, filter.id);
        const state = await f.request({ kind: "address", address: `/?${params}` });
        expect(state.tools).toEqual(referenceTools(calls, copy.names, filters, state.period));
        const unticked = referenceTools(
          calls,
          copy.names,
          filters.filter((filter) => filter.dimension !== "tool"),
          state.period,
        );
        for (const value of state.checklists.find((list) => list.dimension === "tool")!.values)
          expect(value.tokens).toBe(unticked.rows.find((row) => row.id === value.id)?.calls ?? 0);
      },
    ),
    propertyParameters,
  );
});
