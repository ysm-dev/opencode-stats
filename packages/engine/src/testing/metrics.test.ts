import { expect, it, vi } from "vitest";
import * as fc from "fast-check";
import { mapPromptFields, mapStepDimensions } from "@opencode-stats/browser-copy";
import {
  syntheticCopy,
  propertyParameters,
  inMemoryDashboardServer,
} from "@opencode-stats/browser-copy/testing";
import { inThreadEngine, manualClock, blockedSlices } from "./index.ts";
import { rangeFixture } from "./range-fixture.ts";
import {
  metricCopy,
  metricSteps,
  metricPrompts,
  metricNames,
  metricStep,
} from "./metrics-fixture.ts";
import { referenceMetrics } from "./metrics-reference.ts";
import { filterMetadata, filterSteps, filtersForNames } from "./filter-fixture.ts";

it("uses exact observed nearest ranks, counts incomplete failures and interruptions apart, and attributes prompt filters through the next step", async () => {
  const copy = metricCopy();
  await using f = rangeFixture(metricSteps, undefined, undefined, undefined, copy);
  const state = await f.request({ kind: "preset", preset: "today" });
  expect(state.metrics).toEqual(
    referenceMetrics(metricSteps, metricPrompts, metricNames, [], state.period),
  );
  expect(state.metrics).toMatchObject({
    steps: 4,
    prompts: 2,
    stepsPerPrompt: 2,
    failed: 2,
    interrupted: 1,
    failureRate: 0.5,
    response: { p50: 2000, p95: 8000, timedShare: 0.75 },
    context: { median: 200, p95: 800, max: 800 },
    cacheHitRate: 0.5,
  });
  expect(state.comparison).toMatchObject({
    steps: "↑ 300%",
    prompts: "↑ 100%",
    failed: "↑ 100%",
    response: "↑ 100%",
    cacheHitRate: "↑ 0%",
  });
  const all = await f.request({ kind: "all-time" });
  expect(all.metrics.response).toMatchObject({ p50: 1000, p95: 8000, timedShare: 4 / 6 });
  await f.request({ kind: "preset", preset: "today" });
  const model = await f.request({ kind: "filter", dimension: "model", id: "provider-0/model-0" });
  expect(model.metrics.prompts).toBe(1);
  expect(model.metrics.stepsPerPrompt).toBe(4);
  const missing = await f.request({ kind: "filter", dimension: "project", id: "missing" });
  expect(missing.metrics).toMatchObject({
    steps: 0,
    prompts: 0,
    failureRate: null,
    response: { p50: null, p95: null, timedShare: null, recordedFrom: null },
    context: { median: null, p95: null, max: null },
    cacheHitRate: null,
  });
});

it("hides timing and cache comparisons when the previous period did not record their basis", async () => {
  const rows = [
    metricStep("2026-10-01T12:00Z", null),
    { ...metricStep("2026-10-06T12:00Z", null), input: null },
    metricStep("2026-10-07T12:00Z", 1234),
  ];
  await using f = rangeFixture(rows);
  const state = await f.request({ kind: "preset", preset: "today" });
  expect(state.metrics.response.p50).toBe(1234);
  expect(state.metrics.cacheHitRate).toBe(0.5);
  expect(state.comparison).toMatchObject({ response: "", cacheHitRate: "" });
});

it("keeps missing timings and partial token triples missing, and preserves a recorded zero duration", async () => {
  const steps = [{ ...metricStep("2026-10-07T12:00Z", null, 100), cacheWrite: null }];
  await using f = rangeFixture(steps);
  const state = await f.request({ kind: "all-time" });
  expect(state.metrics).toMatchObject({
    stepsPerPrompt: null,
    response: { p50: null, timedShare: 0, recordedFrom: null },
    cacheHitRate: null,
    context: { median: null },
  });
  f.server.commit(syntheticCopy([metricStep("2026-10-07T12:00Z", 0, 0)], { revision: 2 }));
  await vi.waitFor(() =>
    expect(f.states.at(-1)).toMatchObject({
      metrics: {
        response: { p50: 0, p95: 0, timedShare: 1 },
        context: { median: 0, p95: 0, max: 0 },
        cacheHitRate: null,
      },
    }),
  );
});

it("updates prompts on live rewrites and tombstones, then agrees with a replacement copy", async () => {
  const copy = metricCopy();
  await using f = rangeFixture(metricSteps, undefined, undefined, undefined, copy);
  await f.request({ kind: "all-time" });
  await vi.waitFor(() => expect(f.server.streams).toBe(1));
  f.server.commit({
    ...copy,
    revision: 2,
    promptIds: ["new"],
    prompts: mapPromptFields((field) => new Float64Array([copy.prompts[field][0]!])),
  });
  await vi.waitFor(() =>
    expect(f.states.at(-1)).toMatchObject({ revision: 2, metrics: { prompts: 1 } }),
  );
  const updated = await f.request({ kind: "all-time" });
  f.server.commit({
    ...copy,
    generation: "11234567-89ab-cdef-0123-456789abcdef",
    revision: 1,
    promptIds: [],
    prompts: mapPromptFields(() => new Float64Array()),
  });
  await vi.waitFor(() => expect(f.states.at(-1)).toMatchObject({ metrics: { prompts: 0 } }));
  expect(updated.metrics.prompts).toBe(1);
});

it("counts prompts even with no steps, without inventing timings or session placement", async () => {
  const copy = metricCopy();
  await using f = rangeFixture([], undefined, undefined, undefined, { ...copy, ids: [] });
  const state = await f.request({ kind: "all-time" });
  expect(state.period.start).toBe(metricPrompts[0]!.start);
  expect(state.metrics).toMatchObject({
    steps: 0,
    prompts: 3,
    stepsPerPrompt: 0,
    response: { p50: null, timedShare: null },
  });
  expect(state.sessions).toEqual({ total: 0, subagents: 0 });
});

it("discards interrupted prompt slices without exposing an incomplete copy", async () => {
  const server = inMemoryDashboardServer(syntheticCopy([]));
  const slices = blockedSlices();
  const engine = inThreadEngine(server.fetch, queueMicrotask, {
    ...manualClock(),
    ...slices.clock,
  });
  try {
    await engine.client.request({ kind: "all-time" });
    const copy = metricCopy();
    server.commit(
      syntheticCopy([], { revision: 2, promptIds: copy.promptIds, prompts: copy.prompts }),
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

it("matches a row-oriented reference for generated ranges, every filter dimension, missing facts and percentiles", async () => {
  const nullable = fc.option(fc.integer({ min: 0, max: 1000 }), { nil: null });
  await fc.assert(
    fc.asyncProperty(
      fc.array(
        fc.record({
          day: fc.integer({ min: 1, max: 7 }),
          duration: nullable,
          context: fc.integer({ min: 0, max: 1000 }).map((n) => n * 2),
          error: fc.constantFrom(null, 500, 501, 502),
          complete: fc.boolean(),
          estimatedCost: fc.option(
            fc.integer({ min: 0, max: 400 }).map((value) => value / 4),
            { nil: null },
          ),
          recordedCost: fc.option(
            fc.integer({ min: 0, max: 400 }).map((value) => value / 4),
            { nil: null },
          ),
        }),
        { maxLength: 25 },
      ),
      fc.constantFrom("today", "7d", "all", "fixed"),
      fc.subarray(metricNames.filter((name) => name.dimension !== "error")),
      fc.tuple(fc.integer({ min: 1, max: 7 }), fc.integer({ min: 1, max: 7 })),
      async (generated, preset, selected, dates) => {
        const steps = generated.map((row, index) => ({
          ...metricStep(`2026-10-0${row.day}T12:00Z`, row.duration, row.context, row.error),
          ...mapStepDimensions((field) => filterSteps[index % filterSteps.length]![field]),
          cacheWrite: row.complete ? 0 : null,
          estimatedCost: row.estimatedCost,
          recordedCost: row.recordedCost,
        }));
        const prompts = steps.map((step) => ({ ...step, start: step.start - 1 }));
        const server = inMemoryDashboardServer(
          syntheticCopy(steps, {
            ...filterMetadata,
            names: metricNames,
            promptIds: prompts.map((_, i) => `prompt-${i}`),
            prompts: mapPromptFields((field) =>
              Float64Array.from(prompts, (prompt) => prompt[field] ?? NaN),
            ),
          }),
        );
        const engine = inThreadEngine(server.fetch, queueMicrotask, manualClock());
        try {
          const filters = filtersForNames(selected);
          const params = new URLSearchParams({ range: preset });
          if (preset === "fixed") {
            params.set("from", `2026-10-0${Math.min(...dates)}`);
            params.set("to", `2026-10-0${Math.max(...dates)}`);
          }
          for (const filter of filters) params.append(`f.${filter.dimension}`, filter.id);
          const outcome = await engine.client.request({ kind: "address", address: `/?${params}` });
          if (outcome.kind !== "paint" || outcome.state.screen !== "dashboard")
            throw new Error("Missing complete state");
          expect(outcome.state.metrics).toEqual(
            referenceMetrics(steps, prompts, metricNames, filters, outcome.state.period),
          );
        } finally {
          await engine.dispose();
          await server.dispose();
        }
      },
    ),
    propertyParameters,
  );
});
