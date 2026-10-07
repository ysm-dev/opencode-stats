import { expect, it, vi, onTestFinished } from "vitest";
import {
  inMemoryDashboardServer,
  syntheticCopy,
  syntheticStop,
} from "@opencode-stats/browser-copy/testing";
import { inThreadEngine, manualClock } from "./index.ts";
import type { EngineState } from "../index.ts";

function fixture(partial = false) {
  const clock = manualClock();
  let zone = "UTC";
  let locale = "en-GB";
  const today = Date.parse("2026-10-07T00:00Z");
  const facts = [
    { start: today + 1, input: 10, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 },
  ];
  const server = inMemoryDashboardServer(
    syntheticCopy(facts, { historyComplete: !partial, historyCompleteFrom: today }),
  );
  const engine = inThreadEngine(server.fetch, queueMicrotask, {
    ...clock,
    timeZone: () => zone,
    locale: () => locale,
  });
  const states: EngineState[] = [];
  engine.client.subscribe((state) => states.push(state));
  onTestFinished(async () => {
    await engine.dispose();
    await server.dispose();
  });
  return {
    clock,
    server,
    engine,
    states,
    facts,
    region: (nextZone: string, nextLocale: string) => {
      zone = nextZone;
      locale = nextLocale;
    },
  };
}

it.each([false, true])(
  "shows typed stop reasons, announces only a changed reason, and keeps exact partial=%s facts",
  async (partial) => {
    const f = fixture(partial);
    await f.engine.client.request({ kind: "all-time" });
    await vi.waitFor(() => expect(f.server.streams).toBe(1));
    const requests = f.server.requests;
    f.server.status(syntheticStop());
    const prefix = partial ? "History from 7 Oct · not updating" : "Not updating";
    await vi.waitFor(() =>
      expect(f.states.at(-1)).toMatchObject({
        tokens: { total: 10 },
        statusLine: `${prefix} since 14:02 · OpenCode's database is newer than opencode-stats 1.3.0 understands · run bunx opencode-stats@latest`,
        liveLabel: "Not updating",
      }),
    );
    const first = f.states.at(-1)!;
    expect(first.screen === "dashboard" && first.announcement).toContain(prefix);
    await f.clock.advance(2);
    const latest = f.states.at(-1)!;
    expect(latest.screen === "dashboard" && latest.announcement).toBe(
      first.screen === "dashboard" && first.announcement,
    );
    expect(f.server.requests).toBe(requests);
    f.server.status(syntheticStop("source.unreadable", { code: "permission" }));
    await vi.waitFor(() =>
      expect(f.states.at(-1)).toMatchObject({
        announcement: `${prefix} since 14:02 · can't read OpenCode's database: permission denied`,
      }),
    );
    f.server.commit(syntheticCopy([{ ...f.facts[0]!, input: 20 }], { revision: 2 }));
    f.server.status(null);
    await vi.waitFor(() =>
      expect(f.states.at(-1)).toMatchObject({
        tokens: { total: 20 },
        statusLine: "",
        announcement: "Up to date again",
        revision: 2,
      }),
    );
  },
);

it("includes the date only for an earlier local day and uses the server starter's command and path source", async () => {
  const f = fixture();
  await f.engine.client.request({ kind: "all-time" });
  await vi.waitFor(() => expect(f.server.streams).toBe(1));
  f.server.status(
    syntheticStop(
      "source.missing",
      { source: "(`OPENCODE_DB` in OpenCode's service config)" },
      Date.parse("2026-10-02T14:02Z"),
    ),
  );
  await vi.waitFor(() =>
    expect(f.states.at(-1)).toMatchObject({
      statusLine:
        "Not updating since 2 Oct, 14:02 · OpenCode's database is missing from ~/synthetic.db (`OPENCODE_DB` in OpenCode's service config)",
    }),
  );
  f.server.status(syntheticStop("schema.newer", { mode: "plugin" }));
  await vi.waitFor(() =>
    expect(f.states.at(-1)).toMatchObject({
      statusLine: expect.stringContaining("opencode plugin update opencode-stats"),
    }),
  );
});

it.each(["paused", "hidden"])(
  "holds problems and recovery behind the %s barrier",
  async (barrier) => {
    const f = fixture();
    await f.engine.client.request({ kind: "all-time" });
    await vi.waitFor(() => expect(f.server.streams).toBe(1));
    f.engine.client.signal(
      barrier === "paused"
        ? { kind: "paused", paused: true }
        : { kind: "visibility", visible: false },
    );
    await vi.waitFor(() => expect(f.server.streams).toBe(0));
    const before = f.states.length;
    f.server.status(syntheticStop());
    f.server.commit(syntheticCopy([{ ...f.facts[0]!, input: 20 }], { revision: 2 }));
    await f.clock.advance(600);
    expect(f.states).toHaveLength(before);
    f.engine.client.signal(
      barrier === "paused"
        ? { kind: "paused", paused: false }
        : { kind: "visibility", visible: true },
    );
    await vi.waitFor(() =>
      expect(f.states.at(-1)).toMatchObject({
        tokens: { total: 20 },
        liveLabel: "Not updating",
        paused: false,
        stop: { reason: "schema.newer" },
      }),
    );
  },
);

it.each(["same", "replacement"])(
  "a revision-zero stopped store exposes its typed problem and automatically recovers the %s generation",
  async (generation) => {
    const f = fixture();
    f.server.commit(
      syntheticCopy([], { revision: 0, historyComplete: false, historyCompleteFrom: 0 }),
    );
    f.server.status(syntheticStop());
    expect(await f.engine.client.request({ kind: "all-time" })).toMatchObject({
      kind: "paint",
      state: {
        screen: "problem",
        reason: "copy-unavailable",
        stop: { reason: "schema.newer" },
      },
    });
    f.server.commit(
      syntheticCopy([{ ...f.facts[0]!, start: 1, input: 987 }], {
        revision: 1,
        ...(generation === "replacement" ? { generation: "recovered-generation" } : {}),
      }),
    );
    f.server.status(null);
    await vi.waitFor(() =>
      expect(f.states.at(-1)).toMatchObject({
        screen: "dashboard",
        address: "/?range=all",
        tokens: { total: 987 },
        statusLine: "",
      }),
    );
  },
);

it("a stopped incoming generation warns over the retained page, without crossing its today-ready barrier", async () => {
  const f = fixture();
  const loaded = await f.engine.client.request({ kind: "all-time" });
  expect(loaded.kind).toBe("paint");
  if (loaded.kind !== "paint") throw new Error("Initial request did not paint.");
  const initial = loaded.state;
  expect(initial.screen).toBe("dashboard");
  await vi.waitFor(() => expect(f.server.streams).toBe(1));
  f.server.commit(
    syntheticCopy([{ ...f.facts[0]!, input: 20 }], {
      generation: "replacement",
      revision: 1,
      historyComplete: false,
      historyCompleteFrom: Date.parse("2026-10-07T14:00Z"),
    }),
  );
  f.server.status(syntheticStop());
  await vi.waitFor(() =>
    expect(f.states.at(-1)).toMatchObject({
      screen: "dashboard",
      generation: initial.screen === "dashboard" ? initial.generation : "",
      tokens: { total: 10 },
      liveLabel: "Not updating",
    }),
  );
  f.server.status(null);
  await f.clock.advance(60);
  expect(f.states.at(-1)).toMatchObject({
    generation: initial.screen === "dashboard" ? initial.generation : "",
    tokens: { total: 10 },
    liveLabel: "Not updating",
    stop: { reason: "schema.newer" },
  });
  f.server.commit(
    syntheticCopy([{ ...f.facts[0]!, input: 20 }], { generation: "replacement", revision: 2 }),
  );
  f.server.status(null);
  await vi.waitFor(() =>
    expect(f.states.at(-1)).toMatchObject({
      generation: "replacement",
      tokens: { total: 20 },
      statusLine: "",
      announcement: "Up to date again",
    }),
  );
});

it("captures a partial-history warning once, independently of pause, resume, clock, timezone and history display changes", async () => {
  const f = fixture(true);
  await f.engine.client.request({ kind: "all-time" });
  await vi.waitFor(() => expect(f.server.streams).toBe(1));
  f.server.status(syntheticStop());
  await vi.waitFor(() => expect(f.states.at(-1)).toMatchObject({ liveLabel: "Not updating" }));
  const warning = f.states.at(-1)!;
  const text = warning.screen === "dashboard" ? warning.announcement : "";
  expect(text).toMatch(/^History from 7 Oct · not updating since 14:02/u);
  const begin = f.states.length;
  f.engine.client.signal({ kind: "paused", paused: true });
  await vi.waitFor(() => expect(f.states.at(-1)).toMatchObject({ paused: true }));
  f.engine.client.signal({ kind: "paused", paused: false });
  await vi.waitFor(() =>
    expect(f.states.at(-1)).toMatchObject({ paused: false, liveLabel: "Not updating" }),
  );
  f.region("Pacific/Honolulu", "en-US");
  await f.clock.advance(60);
  f.server.commit(syntheticCopy(f.facts, { revision: 2 }));
  await vi.waitFor(() => expect(f.states.at(-1)).toMatchObject({ historyComplete: true }));
  expect(
    f.states
      .slice(begin)
      .every((state) => state.screen === "dashboard" && state.announcement === text),
  ).toBe(true);
  f.server.status(syntheticStop("source.unreadable", { code: "permission" }));
  await vi.waitFor(() =>
    expect(f.states.at(-1)).toMatchObject({
      announcement: expect.stringContaining("permission denied"),
    }),
  );
  f.server.status(null);
  await vi.waitFor(() =>
    expect(f.states.at(-1)).toMatchObject({ announcement: "Up to date again" }),
  );
});
