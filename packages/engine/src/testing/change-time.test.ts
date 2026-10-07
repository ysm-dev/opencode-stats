import { afterEach, expect, it, onTestFinished, vi } from "vitest";
import { syntheticCopy, inMemoryDashboardServer } from "@opencode-stats/browser-copy/testing";
import { createFacts } from "../tokens.ts";
import { systemClock } from "../clock.ts";
import { inThreadEngine, manualClock } from "./index.ts";
import type { ChangeTime } from "../change.ts";
import type { ChannelPort, EngineState } from "../protocol.ts";
import { createPageClient } from "../client.ts";
import { connectEngine } from "../worker-channel.ts";
import { createPostClock } from "../post-clock.ts";
import { referenceTokens } from "./reference.ts";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const postedTiming = (compute = 0, elapsed = 0) => {
  const posted = createPostClock();
  posted.complete(compute, elapsed);
  return posted.data;
};

function receiptClient() {
  let listener!: (event: MessageEvent) => void;
  const port: ChannelPort = {
    postMessage: () => {},
    addEventListener: (_type, receive) => {
      listener = receive;
    },
    removeEventListener: () => {},
  };
  const client = createPageClient(port, () => {});
  onTestFinished(() => client.dispose());
  return { client, receive: (data: object) => listener(new MessageEvent("message", { data })) };
}

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
        sequence: 1,
        state: { screen: "problem", reason: "copy-unavailable" },
        timing: { kind: "live", compute: 0, elapsed: 0, [field]: value },
        posted: postedTiming(),
      }),
    ).rejects.toThrow(new RegExp(field));
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

async function timedNativeChannel(wait: number) {
  let now = 0;
  const native = new MessageChannel();
  let replies = 0;
  const server = inMemoryDashboardServer(syntheticCopy([]));
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const wrap = (port: MessagePort, cloneWork: number, decodeWork: number): ChannelPort => {
    const post: ChannelPort["postMessage"] = port.postMessage.bind(port);
    return {
      postMessage: (message) => {
        post(message);
        now += cloneWork;
        if (port === native.port2) replies++;
      },
      addEventListener: (_type, listener) => {
        port.addEventListener("message", (event: MessageEvent<object>) => {
          const data = event.data;
          // The decoder's actual input access takes work; the preceding delivery
          // delay does not. No schema implementation or state clone is replaced.
          Object.defineProperty(event, "data", {
            get: () => {
              now += decodeWork;
              return data;
            },
          });
          if (port === native.port1) now += wait;
          listener(event);
        });
        port.start();
      },
      removeEventListener: () => {},
    };
  };
  const client = createPageClient(wrap(native.port1, 2, 3), () => {});
  const stop = connectEngine(
    wrap(native.port2, 20, 7),
    { baseUrl: "http://127.0.0.1:22440", fetch: server.fetch, release: "test-release" },
    { ...systemClock, now: () => 1, timeZone: () => "UTC", workNow: () => now },
  );
  onTestFinished(async () => {
    client.dispose();
    await stop();
    native.port1.close();
    native.port2.close();
    await server.dispose();
  });
  const timings: ChangeTime[] = [];
  client.subscribe((_state, timing) => timings.push(timing));
  expect(await client.request({ kind: "all-time" })).toMatchObject({ kind: "paint" });
  expect(replies).toBe(1);
  return timings[0]!;
}

it.each([0, 10000])(
  "includes the real channel's decoder and single reply clone, not its %i ms wait",
  async (wait) => {
    expect(await timedNativeChannel(wait)).toMatchObject({ input: 2, compute: 27, page: 3 });
  },
);

it.each(["paint", "close", "superseded", "request", "replace"])(
  "an early receipt is completed or discarded correctly (%s)",
  async (disposition) => {
    vi.useFakeTimers();
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const { client, receive } = receiptClient();
    const listener = vi.fn<(state: EngineState, timing: ChangeTime) => void>();
    client.subscribe(listener);
    const first = disposition === "replace" ? client.request({ kind: "all-time" }) : undefined;
    const posted = createPostClock();
    receive({
      id: first ? 1 : 0,
      sequence: 1,
      state: { screen: "problem", reason: "copy-unavailable" },
      timing: { kind: "live", compute: 0, elapsed: 0 },
      posted: posted.data,
    });
    expect(listener).not.toHaveBeenCalled();
    if (disposition === "close") client.dispose();
    if (disposition === "request" || disposition === "replace") {
      void client.request({ kind: "all-time" });
    }
    expect(await first).toEqual(disposition === "replace" ? { kind: "replaced" } : undefined);
    if (disposition === "superseded") {
      receive({
        id: 0,
        sequence: 2,
        state: { screen: "problem", reason: "invalid-address" },
        timing: { kind: "live", compute: 0, elapsed: 0 },
        posted: postedTiming(14, 20),
      });
    }
    now += 10000;
    posted.complete(12, 20);
    await vi.runOnlyPendingTimersAsync();
    const paints = disposition === "paint" || disposition === "superseded";
    expect(listener).toHaveBeenCalledTimes(paints ? 1 : 0);
    expect(listener.mock.calls.map(([, timing]) => timing)).toMatchObject(
      paints ? [{ compute: disposition === "superseded" ? 14 : 12, elapsed: 20, page: 0 }] : [],
    );
  },
);

it.each([0, 2])(
  "a replaced unready receipt becomes inert before reading its ready flag %i",
  async (ready) => {
    vi.useFakeTimers();
    const { client, receive } = receiptClient();
    const painted = vi.fn<(state: EngineState, timing: ChangeTime) => void>();
    client.subscribe(painted);
    const first = client.request({ kind: "all-time" });
    const posted = createPostClock();
    const stale = {
      id: 1,
      sequence: 1,
      state: { screen: "problem", reason: "copy-unavailable" },
      timing: { kind: "all-time", compute: 0, elapsed: 0 },
      posted: posted.data,
    };
    receive(stale);
    expect(vi.getTimerCount()).toBe(1);
    const current = client.request({ kind: "address", address: "http://[" });
    expect(await first).toEqual({ kind: "replaced" });
    Atomics.store(new Int32Array(posted.data.buffer, 16, 1), 0, ready);
    await vi.runOnlyPendingTimersAsync();
    expect(vi.getTimerCount()).toBe(0);
    expect(painted).not.toHaveBeenCalled();
    receive({
      id: 2,
      sequence: 2,
      state: { screen: "problem", reason: "invalid-address" },
      timing: { kind: "address", compute: 0, elapsed: 0 },
      posted: postedTiming(1, 1),
    });
    expect(await current).toEqual({
      kind: "paint",
      state: { screen: "problem", reason: "invalid-address" },
    });
    expect(painted).toHaveBeenCalledOnce();
    // No request remains: even a newer serial for the old request cannot revive
    // its unready/invalid record or start another poll.
    receive({ ...stale, sequence: 3 });
    expect(painted).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  },
);

const invalidPosted = () => {
  const flag = postedTiming();
  Atomics.store(new Int32Array(flag.buffer, 16, 1), 0, 2);
  return [
    new Uint8Array(20),
    new Uint8Array(new SharedArrayBuffer(21), 1, 20),
    new Uint8Array(new SharedArrayBuffer(16)),
    flag,
    ...[-1, NaN, Infinity].flatMap((value) => [postedTiming(value, 0), postedTiming(0, value)]),
  ];
};

it.each(invalidPosted())(
  "rejects an untrusted shared timing record %# at the public channel",
  async (posted) => {
    const server = inMemoryDashboardServer(syntheticCopy([]));
    const engine = inThreadEngine(server.fetch);
    onTestFinished(async () => {
      await engine.dispose();
      await server.dispose();
    });
    await expect(
      engine.sendToPage({
        id: 0,
        sequence: 1,
        state: { screen: "problem", reason: "copy-unavailable" },
        timing: { kind: "live", compute: 0, elapsed: 0 },
        posted,
      }),
    ).rejects.toThrow("Invalid shared post clock");
  },
);
