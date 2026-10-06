import { expect, it, vi } from "vitest";
import * as fc from "fast-check";
import type { Step } from "@opencode-stats/browser-copy";
import {
  inMemoryDashboardServer,
  propertyParameters,
  syntheticCopy,
  syntheticSteps,
} from "@opencode-stats/browser-copy/testing";
import { inThreadEngine, referenceTokens } from "./index.ts";
const initial = {
  generation: "01234567-89ab-cdef-0123-456789abcdef",
  revision: 1,
  liveLabel: "Live",
  paused: false,
  statusLine: "",
  announcement: "",
  sessions: { total: 0, subagents: 0 },
};
function loadingEngine() {
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const server = inMemoryDashboardServer(syntheticCopy([]), () => {
    started.resolve();
    return release.promise;
  });
  return { engine: inThreadEngine(server.fetch), server, started, release };
}

async function allTimeState(steps: readonly Step[]) {
  const server = inMemoryDashboardServer(syntheticCopy(steps));
  const engine = inThreadEngine(server.fetch, queueMicrotask, { now: () => 2000000000000 });
  try {
    const outcome = await engine.client.request({ kind: "all-time" });
    expect(engine.answers).toHaveLength(1);
    expect(engine.answers[0]).not.toHaveProperty("copy");
    expect(engine.answers[0]).not.toHaveProperty("steps");
    return outcome;
  } finally {
    await engine.dispose();
    await server.dispose();
  }
}

it("paints complete all-time Tokens through the real page-worker channel and HttpApi", async () => {
  const server = inMemoryDashboardServer(
    syntheticCopy([
      { start: 123, input: 1, cacheRead: 2, cacheWrite: 3, output: 4, reasoning: 5 },
      { start: -1, input: 10, cacheRead: null, cacheWrite: 30, output: 40, reasoning: 50 },
    ]),
  );
  const engine = inThreadEngine(server.fetch);
  try {
    expect(await engine.client.request({ kind: "address", address: "/?range=all" })).toMatchObject({
      kind: "paint",
      state: {
        ...initial,
        screen: "dashboard",
        address: "/?range=all",
        rangeLabel: "All time",
        tokens: { total: 145, input: 11, cacheRead: 2, cacheWrite: 33, output: 44, reasoning: 55 },
      },
    });
    await vi.waitFor(() => expect(server.requests).toBe(2));
    expect(server.addresses).toEqual([
      "http://127.0.0.1:22440/api/browser-copy",
      "http://127.0.0.1:22440/api/browser-copy/live",
    ]);
  } finally {
    await engine.dispose();
    await server.dispose();
  }
});

it("equals the independent reference for synthetic history through the channel", async () => {
  await fc.assert(
    fc.asyncProperty(
      syntheticSteps.map((steps) =>
        steps.map((step) => ({ ...step, start: step.start % 2000000000000 })),
      ),
      async (steps) => {
        expect(await allTimeState(steps)).toMatchObject({
          kind: "paint",
          state: {
            ...initial,
            screen: "dashboard",
            address: "/?range=all",
            rangeLabel: "All time",
            tokens: referenceTokens(steps),
          },
        });
      },
    ),
    propertyParameters,
  );
});

it("does not lose low-order counts when all-time Tokens exceed a safe integer", async () => {
  const steps = [9007199254740991, 2, 1].map((input) => ({
    start: 0,
    input,
    cacheRead: 0,
    cacheWrite: 0,
    output: 0,
    reasoning: 0,
  }));
  expect(await allTimeState(steps)).toMatchObject({
    kind: "paint",
    state: {
      ...initial,
      screen: "dashboard",
      address: "/?range=all",
      rangeLabel: "All time",
      tokens: {
        total: 9007199254740994,
        input: 9007199254740994,
        cacheRead: 0,
        cacheWrite: 0,
        output: 0,
        reasoning: 0,
      },
    },
  });
});

it("replaces an unanswered request, emits only the newest complete state and keeps the copy in the worker", async () => {
  const { started, release, server, engine } = loadingEngine();
  try {
    const first = engine.client.request({ kind: "all-time" });
    await started.promise;
    const latest = engine.client.request({ kind: "address", address: "http://[" });
    expect(await first).toEqual({ kind: "replaced" });
    release.resolve();
    expect(await latest).toEqual({
      kind: "paint",
      state: { screen: "problem", reason: "invalid-address" },
    });
    expect(engine.answers).toEqual([
      { id: 2, state: { screen: "problem", reason: "invalid-address" } },
    ]);
    expect(await engine.client.request({ kind: "all-time" })).toMatchObject({
      kind: "paint",
      state: {
        ...initial,
        screen: "dashboard",
        address: "/?range=all",
        rangeLabel: "All time",
        tokens: { total: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 },
      },
    });
    await vi.waitFor(() => expect(server.requests).toBe(2));
  } finally {
    release.resolve();
    await engine.dispose();
    await server.dispose();
  }
});

it.each([
  { reason: "the dashboard server is unavailable", copy: syntheticCopy([]), offline: true },
  {
    reason: "the initial response contains changes",
    copy: syntheticCopy(
      [{ start: 1, input: 9, cacheRead: null, cacheWrite: 0, output: 2, reasoning: 0 }],
      { kind: "changes" },
    ),
    offline: false,
  },
])("shows a complete problem screen when $reason", async ({ copy, offline }) => {
  const server = inMemoryDashboardServer(copy);
  if (offline) await server.drop();
  const engine = inThreadEngine(server.fetch);
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

it.each(["https://example.com/", "/unsupported"])(
  "rejects an unsupported dashboard address %s",
  async (address) => {
    const server = inMemoryDashboardServer(syntheticCopy([]));
    const engine = inThreadEngine(server.fetch);
    try {
      expect(await engine.client.request({ kind: "address", address })).toEqual({
        kind: "paint",
        state: { screen: "problem", reason: "invalid-address" },
      });
    } finally {
      await engine.dispose();
      await server.dispose();
    }
  },
);

it("closes a loading channel without sending a late state or leaving a pending page request", async () => {
  const { started, release, server, engine } = loadingEngine();
  const pending = engine.client.request({ kind: "all-time" });
  await started.promise;
  const closing = engine.dispose();
  release.resolve();
  await closing;
  expect(await pending).toEqual({ kind: "closed" });
  expect(await engine.client.request({ kind: "all-time" })).toEqual({ kind: "closed" });
  await server.dispose();
  expect(engine.answers).toEqual([]);
});

it.each(["old-first", "new-first"])("ignores stale replies delivered %s", async (order) => {
  const server = inMemoryDashboardServer(syntheticCopy([]));
  const firstSent = Promise.withResolvers<void>();
  const secondSent = Promise.withResolvers<void>();
  const deliveries: (() => void)[] = [];
  const engine = inThreadEngine(server.fetch, (deliver) => {
    deliveries.push(deliver);
    (deliveries.length === 1 ? firstSent : secondSent).resolve();
  });
  try {
    const older = engine.client.request({ kind: "all-time" });
    await firstSent.promise;
    const newer = engine.client.request({ kind: "address", address: "http://[" });
    expect(await older).toEqual({ kind: "replaced" });
    await secondSent.promise;
    for (const index of order === "old-first" ? [0, 1] : [1, 0]) deliveries[index]?.();
    expect(await newer).toEqual({
      kind: "paint",
      state: { screen: "problem", reason: "invalid-address" },
    });
  } finally {
    await engine.dispose();
    await server.dispose();
  }
});

it("disconnects both channel ends when disposed", async () => {
  const server = inMemoryDashboardServer(syntheticCopy([]));
  const engine = inThreadEngine(server.fetch);
  await engine.dispose();
  await expect(engine.sendToWorker({})).resolves.toBeUndefined();
  await expect(engine.sendToPage({})).resolves.toBeUndefined();
  expect(server.requests).toBe(0);
  await server.dispose();
});

it.each([
  { action: { kind: "all-time" } },
  { id: 1, action: { kind: "invalid" } },
  { id: 1, action: { kind: "address", address: 12 } },
])("rejects an untrusted page message %j at the worker boundary", async (message) => {
  const server = inMemoryDashboardServer(syntheticCopy([]));
  const engine = inThreadEngine(server.fetch);
  try {
    await expect(engine.sendToWorker(message)).rejects.toThrow(/Expected|Missing/);
    expect(engine.answers).toEqual([]);
    expect(server.requests).toBe(0);
  } finally {
    await engine.dispose();
    await server.dispose();
  }
});

it.each([
  { state: { screen: "problem", reason: "copy-unavailable" } },
  { id: 1, state: { screen: "problem", reason: "bad" } },
  {
    id: 1,
    state: {
      screen: "dashboard",
      address: "/?range=all",
      rangeLabel: "All time",
      tokens: { total: "bad", input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 },
    },
  },
  {
    id: 1,
    state: {
      screen: "dashboard",
      address: "bad",
      rangeLabel: "All time",
      tokens: { total: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 },
    },
  },
])("rejects an untrusted worker message %j at the page boundary", async (message) => {
  const server = inMemoryDashboardServer(syntheticCopy([]));
  const engine = inThreadEngine(server.fetch);
  try {
    await expect(engine.sendToPage(message)).rejects.toThrow(/Expected|Missing/);
  } finally {
    await engine.dispose();
    await server.dispose();
  }
});
