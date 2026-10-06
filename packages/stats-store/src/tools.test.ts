import { join } from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import * as Effect from "effect/Effect";
import * as fc from "fast-check";
import { expect, it } from "vitest";
import { propertyParameters } from "@opencode-stats/browser-copy/testing";
import { syntheticFixture, type SyntheticMessage } from "./testing/index.ts";
import { fingerprintFixture } from "./testing/fingerprint.ts";
import { observedStore } from "./testing/store.ts";
import { runWithClock } from "./testing/clock.ts";
import { canonicalCopy } from "./testing/canonical.ts";
import { nodeRuntime } from "./runtime.node.ts";

function transitionMessage(action: number, start: number): SyntheticMessage {
  return {
    id: "step",
    session: "root",
    seq: 0,
    start,
    tools: [
      {
        id: "call",
        name: action === 1 ? "bash" : "server.lookup",
        status: action === 2 ? "streaming" : action === 3 ? "error" : "completed",
        error: action === 3 ? "tool.interrupted" : undefined,
        ran: action === 4 ? start : undefined,
        completed: action === 5 ? start + 10 : undefined,
      },
    ],
  };
}

it("counts scalar tool facts under current names once, excluding fork copies and Code Mode's nested calls", async () => {
  const f = syntheticFixture();
  fingerprintFixture(f.writer);
  try {
    await runWithClock(() =>
      Effect.gen(function* () {
        const store = yield* observedStore({ source: f.source, cacheHome: f.folder }, nodeRuntime);
        const copy = yield* store.read();
        const calls = canonicalCopy(copy).tools;
        expect(calls.map((call) => [call.tool, call.outcome])).toEqual([
          ["execute", 1],
          ["invalid", 2],
          ["server.lookup", 3],
          ["patch", 2],
          ["plugin.custom", 3],
          ["read", null],
          ["shell", 1],
          ["read", null],
          ["subagent", 3],
          ["todowrite", 1],
        ]);
        expect(
          calls.every((call) => call.start === 1000 && call.session === "ses-fingerprint"),
        ).toBe(true);
        expect(calls.find((call) => call.tool === "execute")).toMatchObject({
          runStart: 1100,
          completed: 1100,
        });
        expect(calls.find((call) => call.tool === "subagent")).toMatchObject({
          runStart: null,
          completed: 1200,
        });
        expect(calls.some((call) => call.tool === "hidden.lookup")).toBe(false);
        const files = readdirSync(join(f.folder, "opencode-stats"));
        for (const file of files) {
          const bytes = readFileSync(join(f.folder, "opencode-stats", file));
          for (const payload of ["INPUT", "OUTPUT", "ERROR", "NESTED INPUT"])
            expect(bytes.includes(Buffer.from(`SYNTHETIC PRIVATE ${payload}`))).toBe(false);
        }
      }),
    );
  } finally {
    f.dispose();
  }
});

it("replaces changed calls, keeps identical rereads quiet, reattributes through steps, and tombstones removed calls", async () => {
  const f = syntheticFixture();
  const { writer, source, folder } = f;
  writer.session("root");
  writer.session("child", "root");
  const step = { id: "step", session: "child", seq: 0, start: 10 };
  const call = { id: "call", name: "read", status: "running" as const, ran: 11 };
  writer.message({ ...step, tools: [call] });
  try {
    await runWithClock((time) =>
      Effect.gen(function* () {
        const store = yield* observedStore({ source, cacheHome: folder }, nodeRuntime);
        const initial = yield* store.read();
        expect(canonicalCopy(initial).tools[0]).toMatchObject({
          start: 10,
          subagent: "child",
          session: "root",
          outcome: null,
          completed: null,
        });
        writer.message({ ...step, tools: [call] });
        yield* time.tick;
        expect((yield* store.read(initial)).tools).toEqual([]);
        writer.project("moved", "/synthetic-moved");
        writer.move("child", "moved");
        yield* time.tick;
        expect((yield* store.read(initial)).tools).toHaveLength(1);
        expect(canonicalCopy(yield* store.read()).tools[0]!.project).toBe("moved");
        writer.message({
          ...step,
          start: 20,
          provider: "p",
          model: "m",
          tools: [
            { ...call, name: "shell", status: "error", error: "unknown", ran: 21, completed: 31 },
          ],
        });
        yield* time.tick;
        const updated = yield* store.read();
        expect(canonicalCopy(updated).tools[0]).toMatchObject({
          start: 20,
          tool: "shell",
          model: "p/m",
          outcome: 2,
          runStart: 21,
          completed: 31,
        });
        writer.message(step);
        yield* time.tick;
        const deleted = yield* store.read(updated);
        expect(deleted.tools).toEqual([]);
        expect(deleted.tombstones.map((row) => row.id)).toContain("tool:step:call");
        writer.message({ ...step, tools: [call] });
        yield* time.tick;
        expect((yield* store.read(updated)).tombstones).toEqual([]);
        expect((yield* store.read()).tools).toHaveLength(1);
        writer.deleteSession("child");
        yield* time.tick;
        expect((yield* store.read()).tools).toEqual([]);
      }),
    );
  } finally {
    f.dispose();
  }
});

it("incremental calls equal a fresh build after generated tool transitions and reverts", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 1, maxLength: 5 }),
      async (actions) => {
        const f = syntheticFixture();
        const { writer, source, folder } = f;
        writer.session("root");
        try {
          await runWithClock((time) =>
            Effect.gen(function* () {
              const store = yield* observedStore({ source, cacheHome: folder }, nodeRuntime);
              for (const [i, action] of actions.entries()) {
                if (action === 0) writer.revert("root", 0);
                else writer.message(transitionMessage(action, i));
                yield* time.tick;
              }
              const currentFacts = canonicalCopy(yield* store.read());
              const rebuild = yield* observedStore(
                { cacheHome: join(folder, "tools-fresh"), source },
                nodeRuntime,
              );
              expect(canonicalCopy(yield* rebuild.read())).toEqual(currentFacts);
            }),
          );
        } finally {
          f.dispose();
        }
      },
    ),
    { ...propertyParameters, numRuns: 6 },
  );
});
