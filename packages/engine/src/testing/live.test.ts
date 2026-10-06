import { expect, it, vi } from "vitest";
import { createPostClock } from "../post-clock.ts";
import * as fc from "fast-check";
import type { Step } from "@opencode-stats/browser-copy";
import {
  inMemoryDashboardServer,
  propertyParameters,
  syntheticCopy,
} from "@opencode-stats/browser-copy/testing";
import type { EngineState } from "../index.ts";
import { inThreadEngine, referenceTokens, blockedSlices } from "./index.ts";

const step = (input: number | null): Step => ({
  start: 1,
  input,
  cacheRead: null,
  cacheWrite: 0,
  output: 2,
  reasoning: 0,
});
const nextRevision = (engine: ReturnType<typeof inThreadEngine>, revision: number) =>
  new Promise<Extract<EngineState, { screen: "dashboard" }>>((resolve) => {
    const stop = engine.client.subscribe((state) => {
      if (state.screen === "dashboard" && state.revision === revision) {
        stop();
        resolve(state);
      }
    });
  });

it("applies rewritten, inserted and deleted facts, then updates the last-write label without a request", async () => {
  const server = inMemoryDashboardServer(syntheticCopy([step(1), step(10)]));
  const engine = inThreadEngine(server.fetch);
  const states: EngineState[] = [];
  const unsubscribe = engine.client.subscribe((state) => states.push(state));
  try {
    await engine.client.request({ kind: "all-time" });
    const painted = nextRevision(engine, 2);
    server.commit(syntheticCopy([step(20), step(null)], { revision: 2, ids: ["step-1", "new"] }));
    expect((await painted).tokens).toEqual(referenceTokens([step(20), step(null)]));
    expect(states.at(-1)).toMatchObject({ liveLabel: "Last write just now" });
    const requests = server.requests;
    await vi.waitFor(
      () => expect(states.at(-1)).toMatchObject({ liveLabel: "Last write 1 s ago" }),
      { timeout: 2500 },
    );
    expect(server.requests).toBe(requests);
    expect(
      server.addresses.filter((address) => new URL(address).pathname.endsWith("/changes")),
    ).toHaveLength(1);
    unsubscribe();
  } finally {
    await engine.dispose();
    await server.dispose();
  }
});

it.each(["generation", "expired", "mismatched-range"])(
  "replaces the copy after %s changes",
  async (reason) => {
    const server = inMemoryDashboardServer(syntheticCopy([step(100)]));
    const engine = inThreadEngine(server.fetch);
    try {
      await engine.client.request({ kind: "all-time" });
      if (reason === "expired") server.expireBefore(2);
      if (reason === "mismatched-range")
        server.respondWithChanges(
          syntheticCopy([step(999)], { fromRevision: 0, kind: "changes", revision: 2 }),
        );
      const painted = nextRevision(engine, 2);
      const copy = syntheticCopy([step(3)], {
        revision: 2,
        ...(reason === "generation" ? { generation: "11234567-89ab-cdef-0123-456789abcdef" } : {}),
      });
      server.commit(copy);
      expect(await painted).toMatchObject({
        generation: copy.generation,
        tokens: referenceTokens([step(3)]),
      });
      expect(
        server.addresses.filter((address) => new URL(address).pathname === "/api/browser-copy"),
      ).toHaveLength(reason === "expired" ? 1 : 2);
    } finally {
      await engine.dispose();
      await server.dispose();
    }
  },
);

it("keeps the prior complete state while slicing a batch and answers the user's request before the next slice", async () => {
  const server = inMemoryDashboardServer(syntheticCopy([]));
  let work = 0;
  let sliceStart = 0;
  const slices: number[] = [];
  const intervening: EngineState[] = [];
  let engine: ReturnType<typeof inThreadEngine>;
  engine = inThreadEngine(server.fetch, queueMicrotask, {
    workNow: () => work++,
    yield: async () => {
      slices.push(work - 1 - sliceStart);
      sliceStart = work;
      const response = await engine.client.request({ kind: "all-time" });
      if (response.kind === "paint") intervening.push(response.state);
    },
  });
  try {
    await engine.client.request({ kind: "all-time" });
    sliceStart = work;
    const painted = nextRevision(engine, 2);
    const steps = Array.from({ length: 40 }, (_, index) => step(index));
    server.commit(
      syntheticCopy(steps, {
        revision: 2,
        names: [{ dimension: "model", code: 1, id: "test/model", name: "Synthetic model" }],
      }),
    );
    expect((await painted).tokens).toEqual(referenceTokens(steps));
    expect(slices.length).toBeGreaterThan(1);
    expect(slices.every((duration) => duration <= 4)).toBe(true);
    expect(intervening.length).toBe(slices.length);
    expect(
      intervening.every(
        (state) => state.screen === "dashboard" && state.revision === 1 && state.tokens.total === 0,
      ),
    ).toBe(true);
  } finally {
    await engine.dispose();
    await server.dispose();
  }
});

it("yields a large initial copy through the real task scheduler", async () => {
  const steps = Array.from({ length: 20 }, () => step(4));
  const server = inMemoryDashboardServer(syntheticCopy(steps));
  let work = 0;
  const engine = inThreadEngine(server.fetch, queueMicrotask, { workNow: () => (work += 4) });
  try {
    expect(await engine.client.request({ kind: "all-time" })).toMatchObject({
      state: { tokens: referenceTokens(steps) },
    });
    expect(work).toBeGreaterThan(80);
  } finally {
    await engine.dispose();
    await server.dispose();
  }
});

const histories = fc.array(
  fc.record({
    id: fc.integer({ min: 0, max: 4 }),
    remove: fc.boolean(),
    input: fc.option(fc.constantFrom(0, 1, 100, Number.MAX_SAFE_INTEGER), { nil: null }),
  }),
  { minLength: 1, maxLength: 8 },
);

it.each([1, 3])(
  "discards an interrupted %i-row live batch without a partial or late paint",
  async (rows) => {
    const server = inMemoryDashboardServer(syntheticCopy([]));
    const slices = blockedSlices();
    const engine = inThreadEngine(server.fetch, queueMicrotask, slices.clock);
    try {
      await engine.client.request({ kind: "all-time" });
      server.commit(
        syntheticCopy(
          Array.from({ length: rows }, () => step(4)),
          { revision: 2 },
        ),
      );
      await slices.entered;
      server.commit(syntheticCopy([step(8)], { revision: 3 }));
      const closing = engine.dispose();
      slices.release();
      await closing;
      expect(engine.answers).toHaveLength(1);
    } finally {
      slices.release();
      await engine.dispose();
      await server.dispose();
    }
  },
);

it("keeps the prior complete copy after a stream closes, then retries when focused", async () => {
  const server = inMemoryDashboardServer(syntheticCopy([step(1)]));
  const engine = inThreadEngine(server.fetch);
  try {
    await engine.client.request({ kind: "all-time" });
    await vi.waitFor(() => expect(server.requests).toBe(2));
    await server.drop();
    server.commit(syntheticCopy([step(2)], { revision: 2 }));
    expect(await engine.client.request({ kind: "all-time" })).toMatchObject({
      state: { revision: 1, tokens: referenceTokens([step(1)]) },
    });
    server.resume();
    engine.client.signal({ kind: "focus" });
    const painted = nextRevision(engine, 3);
    server.commit(syntheticCopy([step(3)], { revision: 3 }));
    expect((await painted).tokens).toEqual(referenceTokens([step(3)]));
  } finally {
    await engine.dispose();
    await server.dispose();
  }
});

it("still paints its complete copy when opening the live stream fails", async () => {
  const server = inMemoryDashboardServer(syntheticCopy([step(2)]), () => {
    void server.drop();
    return Promise.resolve();
  });
  const engine = inThreadEngine(server.fetch);
  try {
    expect(await engine.client.request({ kind: "all-time" })).toMatchObject({
      state: { tokens: referenceTokens([step(2)]) },
    });
    await vi.waitFor(() => expect(server.requests).toBe(2));
  } finally {
    await engine.dispose();
    await server.dispose();
  }
});

it("does not let an unsolicited live paint replace an unanswered user request", async () => {
  const posted = createPostClock();
  posted.complete(0, 0);
  const server = inMemoryDashboardServer(syntheticCopy([]));
  const sent = Promise.withResolvers<void>();
  let deliver!: () => void;
  const engine = inThreadEngine(server.fetch, (answer) => {
    deliver = answer;
    sent.resolve();
  });
  const listener = vi.fn<(state: EngineState) => void>();
  const unsubscribe = engine.client.subscribe(listener);
  try {
    const pending = engine.client.request({ kind: "all-time" });
    await sent.promise;
    await engine.sendToPage({
      id: 0,
      sequence: 2,
      state: { screen: "problem", reason: "invalid-address" },
      timing: { kind: "live", compute: 0, elapsed: 0 },
      posted: posted.data,
    });
    expect(listener).not.toHaveBeenCalled();
    deliver();
    expect(await pending).toMatchObject({ kind: "paint", state: { screen: "dashboard" } });
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    await engine.sendToPage({
      id: 0,
      sequence: 2,
      state: { screen: "problem", reason: "invalid-address" },
      timing: { kind: "live", compute: 0, elapsed: 0 },
      posted: posted.data,
    });
    expect(listener).toHaveBeenCalledOnce();
  } finally {
    await engine.dispose();
    await server.dispose();
  }
});

it("matches the independent reference after every revision of generated edit/delete histories", async () => {
  await fc.assert(
    fc.asyncProperty(histories, async (history) => {
      const server = inMemoryDashboardServer(syntheticCopy([]));
      const engine = inThreadEngine(server.fetch);
      const facts = new Map<string, Step>();
      let revision = 1;
      try {
        await engine.client.request({ kind: "all-time" });
        for (const operation of history) {
          const id = `step-${operation.id}`;
          if (operation.remove) facts.delete(id);
          else facts.set(id, step(operation.input));
          const painted = nextRevision(engine, ++revision);
          server.commit(syntheticCopy([...facts.values()], { revision, ids: [...facts.keys()] }));
          expect((await painted).tokens).toEqual(referenceTokens([...facts.values()]));
        }
      } finally {
        await engine.dispose();
        await server.dispose();
      }
    }),
    propertyParameters,
  );
});
