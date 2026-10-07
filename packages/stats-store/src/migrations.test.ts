import * as Effect from "effect/Effect";
import { rmSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { stayInSync, type StoreEvent, type StoreCopy } from "./store.ts";
import { nodeRuntime } from "./runtime.node.ts";
import { readBuilt, syntheticFixture } from "./testing/index.ts";
import { runWithClock } from "./testing/clock.ts";
import { canonicalCopy } from "./testing/canonical.ts";
import { storePaths } from "./location.ts";

it.each(["live", "restart"])(
  "recognized migrations reread in place across %s, including physical column reordering",
  async (mode) => {
    const f = syntheticFixture("2.0.0");
    const events: StoreEvent[] = [];
    const options = { source: f.source, cacheHome: f.folder };
    const message = { id: "one", session: "root", seq: 0, start: 1 };
    let before!: StoreCopy;
    let after!: StoreCopy;
    let changes!: readonly string[];
    try {
      f.writer.session("root");
      f.writer.session("unchanged");
      f.writer.message({ ...message, tokens: { output: 1 } });
      await runWithClock((time) =>
        Effect.gen(function* () {
          const store = yield* stayInSync(
            options,
            nodeRuntime,
            () => {},
            (event) => events.push(event),
          );
          before = yield* store.read();
          if (mode === "live") {
            f.writer.message({ ...message, tokens: { output: 9 } }, false);
            f.writer.migrate();
            yield* time.tick;
            after = yield* store.read();
            changes = (yield* store.read({
              generation: before.generation,
              revision: before.revision,
            })).facts.map((fact) => fact.id);
          }
        }),
      );
      if (mode === "restart") {
        before = await readBuilt(options, () => {}, nodeRuntime);
        f.writer.message({ ...message, tokens: { output: 9 } }, false);
        f.writer.migrate();
        await runWithClock(() =>
          Effect.gen(function* () {
            const store = yield* stayInSync(
              options,
              nodeRuntime,
              () => {},
              (event) => events.push(event),
            );
            after = yield* store.read();
            changes = (yield* store.read({
              generation: before.generation,
              revision: before.revision,
            })).facts.map((fact) => fact.id);
          }),
        );
      }
      expect(after.generation).toBe(before.generation);
      expect(after.steps[0]!.output).toBe(9);
      expect(changes).toEqual(["one"]);
      expect(events).toContainEqual(
        expect.objectContaining({
          kind: "reread.end",
          reason: "migration",
          sessions: 2,
          changed: 1,
        }),
      );
      expect(events.filter((event) => event.kind === "reread.start")).toHaveLength(1);
      expect(events.filter((event) => event.kind === "build.start")).toHaveLength(1);
      const incremental = await readBuilt(options, () => {}, nodeRuntime);
      const fresh = await readBuilt(
        { source: f.source, cacheHome: `${f.folder}/fresh` },
        () => {},
        nodeRuntime,
      );
      expect(canonicalCopy(incremental)).toEqual(canonicalCopy(fresh));
    } finally {
      f.dispose();
    }
  },
);

it.each(["2.0.0", "2.0.15"])(
  "%s import progress only checks the schema; completion rereads once without losing history or generation",
  async (release) => {
    const f = syntheticFixture(release);
    const events: StoreEvent[] = [];
    try {
      f.writer.session("root");
      f.writer.session("unchanged");
      const message = { id: "one", session: "root", seq: 0, start: 1 };
      f.writer.message({ ...message, tokens: { output: 1 } });
      f.writer.importMarker("sessions", "root");
      await runWithClock((time) =>
        Effect.gen(function* () {
          const store = yield* stayInSync(
            { source: f.source, cacheHome: f.folder },
            nodeRuntime,
            () => {},
            (event) => events.push(event),
          );
          const before = yield* store.read();
          f.writer.message({ ...message, tokens: { output: 8 } }, false);
          f.writer.importMarker("sessions", "unchanged");
          yield* time.tick;
          expect((yield* store.read()).steps[0]!.output).toBe(1);
          expect(events.filter((event) => event.kind === "schema.checked")).toHaveLength(2);
          expect(events.some((event) => event.kind === "reread.start")).toBe(false);
          f.writer.importMarker("completed");
          yield* time.tick;
          const after = yield* store.read();
          expect(after.steps[0]!.output).toBe(8);
          expect(after.generation).toBe(before.generation);
          expect(after.historyComplete).toBe(true);
          const changedRevision = after.revision;
          expect(events).toContainEqual(
            expect.objectContaining({
              kind: "reread.end",
              reason: "import",
              sessions: 2,
              changed: 1,
            }),
          );
          f.writer.importMarker("completed");
          yield* time.tick;
          expect(events.filter((event) => event.kind === "reread.start")).toHaveLength(1);
          expect((yield* store.read()).revision).toBe(changedRevision);
          const fresh = yield* stayInSync(
            { source: f.source, cacheHome: `${f.folder}/fresh` },
            nodeRuntime,
            () => {},
          );
          expect(canonicalCopy(after)).toEqual(canonicalCopy(yield* fresh.read()));
        }),
      );
    } finally {
      f.dispose();
    }
  },
);

it("an unknown newer migration stops once and recovery catches up in the same generation", async () => {
  const f = syntheticFixture();
  const events: StoreEvent[] = [];
  try {
    f.writer.session("root");
    const message = { id: "one", session: "root", seq: 0, start: 1 };
    f.writer.message({ ...message, tokens: { input: 1 } });
    await runWithClock((time) =>
      Effect.gen(function* () {
        const store = yield* stayInSync(
          { source: f.source, cacheHome: f.folder },
          nodeRuntime,
          () => {},
          (event) => events.push(event),
        );
        const before = yield* store.read();
        f.writer.migration("20261007120000_future");
        f.writer.message({ ...message, tokens: { input: 2 } });
        yield* time.tick;
        yield* time.tick;
        expect((yield* store.read()).facts).toEqual(before.facts);
        expect(events.filter((event) => event.kind === "sync.stopped")).toHaveLength(1);
        f.writer.migration("20261007120000_future", false);
        yield* time.tick;
        const after = yield* store.read();
        expect(after.generation).toBe(before.generation);
        expect(after.steps[0]!.input).toBe(2);
        expect(events).toContainEqual(
          expect.objectContaining({ kind: "sync.resumed", reason: "schema.newer" }),
        );
      }),
    );
  } finally {
    f.dispose();
  }
});

it("a v1 import completed during downtime rereads in place from its durable receipt", async () => {
  const f = syntheticFixture();
  try {
    f.writer.session("root");
    const message = { id: "imported", session: "root", seq: 0, start: 1 };
    f.writer.message({ ...message, tokens: { input: 3 } });
    f.writer.importMarker("sessions", "root");
    const options = { source: f.source, cacheHome: f.folder };
    const before = await readBuilt(options, () => {}, nodeRuntime);
    f.writer.message({ ...message, tokens: { input: 7 } }, false);
    f.writer.importMarker("completed");
    const events: StoreEvent[] = [];
    const after = await readBuilt(
      options,
      () => {},
      nodeRuntime,
      (event) => events.push(event),
    );
    expect(after.generation).toBe(before.generation);
    expect(after.steps[0]!.input).toBe(7);
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "reread.end", reason: "import", sessions: 1, changed: 1 }),
    );
  } finally {
    f.dispose();
  }
});

it.each(["missing", "malformed"])(
  "a %s reconciliation receipt verifies cached facts instead of trusting equal counters",
  async (receipt) => {
    const f = syntheticFixture();
    const options = { source: f.source, cacheHome: f.folder };
    const events: StoreEvent[] = [];
    try {
      f.writer.session("receipt-session");
      const message = { id: "receipt-message", session: "receipt-session", seq: 0, start: 1 };
      f.writer.message({ ...message, tokens: { output: 4 } });
      const before = await readBuilt(options, () => {}, nodeRuntime);
      const file = `${storePaths(options).store}.sync`;
      if (receipt === "missing") rmSync(file);
      else writeFileSync(file, "{invalid synthetic receipt");
      f.writer.message({ ...message, tokens: { output: 13 } }, false);
      const after = await readBuilt(
        options,
        () => {},
        nodeRuntime,
        (event) => events.push(event),
      );
      expect(after.generation).toBe(before.generation);
      expect(after.steps[0]!.output).toBe(13);
      expect(events.filter((event) => event.kind === "build.start")).toEqual([]);
      const fresh = await readBuilt(
        { ...options, cacheHome: `${f.folder}/verified` },
        () => {},
        nodeRuntime,
      );
      expect(canonicalCopy(after)).toEqual(canonicalCopy(fresh));
    } finally {
      f.dispose();
    }
  },
);
