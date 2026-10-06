import { expect, it, onTestFinished, vi } from "vitest";
import { formatVersion } from "@opencode-stats/browser-copy";
import { inMemoryDashboardServer, syntheticCopy } from "@opencode-stats/browser-copy/testing";
import type { EngineState } from "../index.ts";
import { inThreadEngine, manualClock } from "./index.ts";
import { blockedSlices } from "./blocked-slices.ts";

const copy = (revision = 1) =>
  syntheticCopy(
    [{ start: 1, input: revision * 10, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 }],
    { revision },
  );
const fixture = () => {
  const clock = manualClock();
  const server = inMemoryDashboardServer(copy());
  const reload = vi.fn<() => void>();
  const engine = inThreadEngine(server.fetch, queueMicrotask, clock, reload);
  const paints: EngineState[] = [];
  engine.client.subscribe((state) => paints.push(state));
  onTestFinished(async () => {
    await engine.dispose();
    await server.dispose();
  });
  return { clock, server, engine, reload, paints };
};
const open = async (f: ReturnType<typeof fixture>) => {
  await f.engine.client.request({ kind: "all-time" });
  await vi.waitFor(() => expect(f.server.streams).toBe(1));
};

it("retries every two visible seconds, warns once after five and clears the warning with recovered facts", async () => {
  const f = fixture();
  await open(f);
  await f.server.drop();
  await vi.waitFor(() => expect(f.server.streams).toBe(0));
  await f.clock.advance(1);
  expect(f.server.requests).toBe(2);
  await f.clock.advance(1);
  await vi.waitFor(() => expect(f.server.requests).toBe(3));
  await f.clock.advance(2);
  await vi.waitFor(() => expect(f.server.requests).toBe(4));
  expect(f.paints.at(-1)).toMatchObject({ liveLabel: "Live" });
  await f.clock.advance(1);
  await vi.waitFor(() =>
    expect(f.paints.at(-1)).toMatchObject({
      liveLabel: "Not updating",
      statusLine: "Not updating since 14:02 · the dashboard server isn't running",
      tokens: { total: 10 },
    }),
  );
  const warnings = f.paints.length;
  await f.clock.advance(1);
  await vi.waitFor(() => expect(f.server.requests).toBe(5));
  expect(f.paints).toHaveLength(warnings);
  f.server.commit(copy(3));
  f.server.resume();
  await f.clock.advance(2);
  await vi.waitFor(() =>
    expect(f.paints.at(-1)).toMatchObject({
      revision: 3,
      statusLine: "",
      announcement: "Up to date again",
      tokens: { total: 30 },
    }),
  );
  expect(f.paints).toHaveLength(warnings + 1);
});

it.each(["visibility", "paused"] as const)(
  "suspends %s streams, clocks and requests, then catches up in one paint",
  async (kind) => {
    const f = fixture();
    await open(f);
    f.engine.client.signal(
      kind === "visibility" ? { kind, visible: false } : { kind, paused: true },
    );
    await vi.waitFor(() => expect(f.server.streams).toBe(0));
    expect(f.clock.ticking).toBe(0);
    const count = f.paints.length;
    const requests = f.server.requests;
    f.server.commit(copy(2));
    f.server.commit(copy(3));
    await f.clock.advance(10);
    f.engine.client.signal({ kind: "focus" });
    await Promise.resolve();
    expect(f.server.requests).toBe(requests);
    expect(f.paints).toHaveLength(count);
    const before = f.paints.length;
    f.engine.client.signal(
      kind === "visibility" ? { kind, visible: true } : { kind, paused: false },
    );
    await vi.waitFor(() =>
      expect(f.paints.at(-1)).toMatchObject({ revision: 3, paused: false, statusLine: "" }),
    );
    expect(f.paints).toHaveLength(before + 1);
    expect(f.server.addresses.filter((url) => url.includes("/changes?"))).toHaveLength(1);
  },
);

it("keeps pause while hidden and clears it on a same-revision resume", async () => {
  const f = fixture();
  await open(f);
  f.engine.client.signal({ kind: "paused", paused: true });
  f.engine.client.signal({ kind: "visibility", visible: false });
  f.engine.client.signal({ kind: "visibility", visible: true });
  await vi.waitFor(() => expect(f.server.streams).toBe(0));
  expect(f.paints.at(-1)).toMatchObject({ paused: true });
  expect(await f.engine.client.request({ kind: "all-time" })).toMatchObject({
    state: { revision: 1, liveLabel: "Paused", statusLine: "Paused at 14:02" },
  });
  f.engine.client.signal({ kind: "paused", paused: false });
  await vi.waitFor(() => expect(f.paints.at(-1)).toMatchObject({ paused: false, revision: 1 }));
});

it("warns when Resume cannot reach the server, while intentional pause stays frozen", async () => {
  const f = fixture();
  await open(f);
  f.engine.client.signal({ kind: "paused", paused: true });
  await vi.waitFor(() => expect(f.server.streams).toBe(0));
  await f.server.drop();
  f.engine.client.signal({ kind: "paused", paused: false });
  await vi.waitFor(() => expect(f.server.requests).toBe(3));
  await f.clock.advance(5);
  await vi.waitFor(() =>
    expect(f.paints.at(-1)).toMatchObject({ liveLabel: "Not updating", tokens: { total: 10 } }),
  );
  f.engine.client.signal({ kind: "paused", paused: true });
  await vi.waitFor(() => expect(f.clock.ticking).toBe(0));
  await f.clock.advance(60);
  expect(f.paints.at(-1)).toMatchObject({ liveLabel: "Paused", statusLine: "Paused at 14:02" });
  f.server.resume();
  f.engine.client.signal({ kind: "paused", paused: false });
  await vi.waitFor(() =>
    expect(f.paints.at(-1)).toMatchObject({ statusLine: "", announcement: "Up to date again" }),
  );
});

it.each(["format", "release"])(
  "reloads a changed %s at the required visibility boundary",
  async (kind) => {
    const f = fixture();
    await open(f);
    await f.server.drop();
    f.server.resume({
      format: kind === "format" ? formatVersion + 1 : formatVersion,
      release: "next-release",
    });
    f.engine.client.signal({ kind: "focus" });
    await vi.waitFor(() => expect(f.server.requests).toBe(kind === "format" ? 3 : 4));
    await vi.waitFor(() => expect(f.reload).toHaveBeenCalledTimes(kind === "format" ? 1 : 0));
    f.engine.client.signal({ kind: "visibility", visible: false });
    await vi.waitFor(() => expect(f.reload).toHaveBeenCalledOnce());
  },
);

it("keeps a hidden initial request pending and starts only when shown", async () => {
  const f = fixture();
  f.engine.client.signal({ kind: "visibility", visible: false });
  const pending = f.engine.client.request({ kind: "all-time" });
  await Promise.resolve();
  expect(f.server.requests).toBe(0);
  await f.clock.advance(10);
  f.engine.client.signal({ kind: "visibility", visible: true });
  expect(await pending).toMatchObject({ state: { revision: 1 } });
  await f.engine.dispose();
  f.engine.client.signal({ kind: "focus" });
});

it("replaces the whole generation on reconnection, and recovers an initially unavailable copy", async () => {
  const f = fixture();
  await f.server.drop();
  expect(await f.engine.client.request({ kind: "all-time" })).toMatchObject({
    state: { screen: "problem" },
  });
  await vi.waitFor(() => expect(f.server.requests).toBe(2));
  f.server.resume();
  f.engine.client.signal({ kind: "focus" });
  await vi.waitFor(() => expect(f.paints.at(-1)).toMatchObject({ revision: 1 }));
  await f.server.drop();
  f.server.commit({ ...copy(2), generation: "11234567-89ab-cdef-0123-456789abcdef" });
  f.server.resume();
  f.engine.client.signal({ kind: "focus" });
  await vi.waitFor(() =>
    expect(f.paints.at(-1)).toMatchObject({
      revision: 2,
      generation: "11234567-89ab-cdef-0123-456789abcdef",
    }),
  );
  expect(
    f.server.addresses.filter((url) => new URL(url).pathname.endsWith("/changes")),
  ).toHaveLength(0);
});

it("discards sliced work on hide and does not commit or paint until the shown catch-up", async () => {
  const server = inMemoryDashboardServer(syntheticCopy([]));
  const slices = blockedSlices();
  const engine = inThreadEngine(server.fetch, queueMicrotask, slices.clock);
  onTestFinished(async () => {
    slices.release();
    await engine.dispose();
    await server.dispose();
  });
  await engine.client.request({ kind: "all-time" });
  server.commit(copy(2));
  await slices.entered;
  engine.client.signal({ kind: "visibility", visible: false });
  await vi.waitFor(() => expect(server.streams).toBe(0));
  slices.release();
  expect(engine.answers).toHaveLength(1);
  const answer = engine.client.request({ kind: "all-time" });
  engine.client.signal({ kind: "visibility", visible: true });
  expect(await answer).toMatchObject({ state: { revision: 2, tokens: { total: 20 } } });
});

it.each(["failure", "hide"])(
  "retains its complete state through a changes fetch %s",
  async (reason) => {
    const server = inMemoryDashboardServer(copy());
    const response = Promise.withResolvers<Response>();
    const entered = Promise.withResolvers<void>();
    let block = true;
    const engine = inThreadEngine((input, init) => {
      if (block && new Request(input, init).url.includes("/changes?")) {
        entered.resolve();
        return response.promise;
      }
      return server.fetch(input, init);
    });
    onTestFinished(async () => {
      response.resolve(new Response(null, { status: 503 }));
      await engine.dispose();
      await server.dispose();
    });
    await engine.client.request({ kind: "all-time" });
    server.commit(copy(2));
    await entered.promise;
    if (reason === "hide") {
      engine.client.signal({ kind: "visibility", visible: false });
      await Promise.resolve();
    }
    response.resolve(new Response(null, { status: 503 }));
    await vi.waitFor(() => expect(server.streams).toBe(0));
    expect(engine.answers).toHaveLength(1);
    block = false;
    engine.client.signal({ kind: "visibility", visible: true });
    await vi.waitFor(() => expect(engine.answers.at(-1)).toMatchObject({ state: { revision: 2 } }));
  },
);
