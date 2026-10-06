import { expect, it, vi } from "vitest";
import * as fc from "fast-check";
import { mapSessionFields, type SessionFact } from "@opencode-stats/browser-copy";
import {
  syntheticCopy,
  inMemoryDashboardServer,
  propertyParameters,
} from "@opencode-stats/browser-copy/testing";
import { inThreadEngine, referenceSessions } from "./index.ts";

const sessions: readonly SessionFact[] = [
  { code: 0, parent: null, session: 0, project: 9, fork: null },
  { code: 1, parent: 0, session: 0, project: 9, fork: null },
  { code: 2, parent: 1, session: 0, project: 9, fork: null },
  { code: 3, parent: null, session: 3, project: 9, fork: 0 },
  { code: 4, parent: null, session: 4, project: 9, fork: null },
];
const step = (start: number, session: number, subagent: number | null) => ({
  start,
  session,
  subagent,
  input: null,
  cacheRead: null,
  cacheWrite: null,
  output: null,
  reasoning: null,
});
const copyFor = (steps: Parameters<typeof syntheticCopy>[0], facts = sessions, revision = 1) =>
  syntheticCopy(steps, {
    revision,
    sessions: mapSessionFields((field) =>
      Float64Array.from(facts, (session) => session[field] ?? NaN),
    ),
    projects: new Float64Array([9]),
  });

it("places a session and every nested subagent at their first descendant step, counts a fork once, and ignores empty sessions", async () => {
  const steps = [step(50, 0, 2), step(10, 0, 2), step(20, 0, 1), step(30, 3, null)];
  const server = inMemoryDashboardServer(copyFor(steps));
  const engine = inThreadEngine(server.fetch);
  try {
    expect(await engine.client.request({ kind: "all-time" })).toMatchObject({
      state: { sessions: { total: 2, subagents: 2 } },
    });
    const reference = referenceSessions(steps, sessions);
    expect(reference).toEqual({ total: 2, subagents: 2 });
    server.commit(
      copyFor(
        [step(10, 1, 2)],
        sessions.slice(1, 3).map((session) => ({ ...session, session: 1 })),
        2,
      ),
    );
    await vi.waitFor(() =>
      expect(engine.answers.at(-1)).toMatchObject({
        state: { revision: 2, sessions: { total: 1, subagents: 1 } },
      }),
    );
    server.commit({ ...copyFor([], [], 3), projects: new Float64Array() });
    await vi.waitFor(() =>
      expect(engine.answers.at(-1)).toMatchObject({
        state: { revision: 3, sessions: { total: 0, subagents: 0 } },
      }),
    );
  } finally {
    await engine.dispose();
    await server.dispose();
  }
});

it("equals the row-oriented reference for generated first-step placements and nested history", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.record({ start: fc.integer(), code: fc.integer({ min: 0, max: 3 }) }), {
        maxLength: 40,
      }),
      async (rows) => {
        const steps = rows.map(({ start, code }) =>
          step(start, code === 3 ? 3 : 0, code === 1 || code === 2 ? code : null),
        );
        const server = inMemoryDashboardServer(copyFor(steps));
        const engine = inThreadEngine(server.fetch);
        try {
          expect(await engine.client.request({ kind: "all-time" })).toMatchObject({
            state: { sessions: referenceSessions(steps, sessions) },
          });
        } finally {
          await engine.dispose();
          await server.dispose();
        }
      },
    ),
    propertyParameters,
  );
});

it("terminates cyclic imported parent links and tolerates an absent parent fact", async () => {
  const malformed = [
    { code: 1, parent: 2, session: 0, project: 9, fork: null },
    { code: 2, parent: 1, session: 0, project: 9, fork: null },
  ];
  const server = inMemoryDashboardServer(copyFor([step(1, 0, 1), step(2, 3, 4)], malformed));
  const engine = inThreadEngine(server.fetch);
  try {
    expect(await engine.client.request({ kind: "all-time" })).toMatchObject({
      state: { sessions: { total: 2, subagents: 3 } },
    });
  } finally {
    await engine.dispose();
    await server.dispose();
  }
});

it.each(["metadata", "ancestor", "placements"])(
  "discards a canceled %s slice without painting a partial Sessions headline",
  async (phase) => {
    const server = inMemoryDashboardServer(syntheticCopy([]));
    let work = 0;
    let slices = 0;
    const rows = [step(1, 0, phase === "ancestor" ? 2 : null), step(2, 0, null)];
    const copy = copyFor(rows, sessions.slice(0, 3), 2);
    const beforePlacement = rows.length + copy.sessions.code.length + copy.projects.length;
    const stopAt = phase === "metadata" ? rows.length + 1 : beforePlacement + 1;
    let closing: Promise<void> | undefined;
    const engine = inThreadEngine(server.fetch, queueMicrotask, {
      workNow: () => (work += 4),
      yield: () => {
        if (++slices === stopAt) closing = engine.dispose();
        return Promise.resolve();
      },
    });
    try {
      await engine.client.request({ kind: "all-time" });
      server.commit(copy);
      await vi.waitFor(() => expect(closing).toBeDefined());
      await closing;
      expect(engine.answers).toHaveLength(1);
    } finally {
      await engine.dispose();
      await server.dispose();
    }
  },
);
