import { expect, it, onTestFinished, vi } from "vitest";
import { syntheticCopy, inMemoryDashboardServer } from "@opencode-stats/browser-copy/testing";
import { createFacts } from "../tokens.ts";
import { systemClock } from "../clock.ts";
import { inThreadEngine, manualClock } from "./index.ts";
import type { ChangeTime } from "../change.ts";
import type { EngineState } from "../protocol.ts";
import { referenceTokens } from "./reference.ts";

const step = (input: number) => ({
  start: 1,
  input,
  cacheRead: null,
  cacheWrite: null,
  output: null,
  reasoning: null,
});

async function slicedWork(wait: number) {
  let now = 0;
  const work: number[] = [];
  const facts = createFacts({
    ...systemClock,
    workNow: () => ++now,
    yield: async () => {
      now += wait;
    },
  });
  const steps = Array.from({ length: 8 }, (_, index) => step(index + 1));
  expect(
    await facts.apply(syntheticCopy(steps), new AbortController().signal, (part) => {
      work.push(part);
    }),
  ).toBe(true);
  expect(facts.current()?.tokens).toEqual(referenceTokens(steps));
  return { sum: work.reduce((total, part) => total + part, 0), now, count: work.length };
}

it("times each actual fact/index slice, never the yielding gap, while keeping reference totals intact", async () => {
  const short = await slicedWork(1000);
  const long = await slicedWork(100000);
  expect(short.count).toBeGreaterThan(1);
  expect(long.sum).toBe(short.sum);
  expect(long.sum).toBeGreaterThan(0);
  expect(long.now).toBeGreaterThan(short.now * 10);
});

it.each(
  [-1, NaN, Infinity].flatMap((value) => ["compute", "elapsed"].map((field) => ({ value, field }))),
)(
  "rejects untrusted $field=$value before timing metadata reaches the page",
  async ({ value, field }) => {
    const server = inMemoryDashboardServer(syntheticCopy([]));
    const engine = inThreadEngine(server.fetch);
    onTestFinished(async () => {
      await engine.dispose();
      await server.dispose();
    });
    const listener = vi.fn<(state: EngineState, timing: ChangeTime) => void>();
    engine.client.subscribe(listener);
    await expect(
      engine.sendToPage({
        id: 0,
        state: { screen: "problem", reason: "copy-unavailable" },
        timing: { kind: "live", compute: 0, elapsed: 0, [field]: value },
      }),
    ).rejects.toThrow();
    expect(listener).not.toHaveBeenCalled();
  },
);

it("the real channel labels every input, timer, pause/resume and visible catch-up without forwarding private fields", async () => {
  const clock = manualClock(Date.parse("2026-10-07T23:58Z"));
  const server = inMemoryDashboardServer(syntheticCopy([step(12)]));
  const engine = inThreadEngine(server.fetch, queueMicrotask, clock);
  onTestFinished(async () => {
    await engine.dispose();
    await server.dispose();
  });
  const timings: ChangeTime[] = [];
  engine.client.subscribe((_state, timing) => {
    timings.push(timing);
  });
  await engine.client.request({
    kind: "address",
    address: "/?range=all&f.model=synthetic-private",
  });
  await vi.waitFor(() => expect(server.streams).toBe(1));
  expect(await engine.client.request({ kind: "remove-fixed", preset: "today" })).toMatchObject({
    kind: "paint",
    state: { address: "/?range=today&f.model=synthetic-private", rangeLabel: "Today" },
  });
  await clock.advance(60);
  await clock.advance(60);
  engine.client.signal({ kind: "paused", paused: true });
  await vi.waitFor(() => expect(timings.at(-1)?.kind).toBe("pause"));
  engine.client.signal({ kind: "paused", paused: false });
  await vi.waitFor(() => expect(timings.at(-1)?.kind).toBe("resume"));
  engine.client.signal({ kind: "visibility", visible: false });
  await vi.waitFor(() => expect(server.streams).toBe(0));
  server.commit(syntheticCopy([step(20)], { revision: 2 }));
  engine.client.signal({ kind: "visibility", visible: true });
  await vi.waitFor(() => expect(timings.at(-1)?.kind).toBe("visible"));
  expect(timings.map((timing) => timing.kind)).toEqual(
    expect.arrayContaining([
      "address",
      "remove-fixed",
      "minute",
      "day",
      "pause",
      "resume",
      "visible",
    ]),
  );
  expect(
    timings.every(
      (timing) =>
        timing.compute >= 0 && timing.input >= 0 && timing.page >= 0 && timing.elapsed >= 0,
    ),
  ).toBe(true);
  expect(JSON.stringify(timings)).not.toContain("synthetic-private");
  expect(JSON.stringify(timings)).not.toContain("generation");
});
