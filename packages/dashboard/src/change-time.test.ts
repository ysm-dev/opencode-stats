import { afterEach, expect, it, vi } from "vitest";
import * as fc from "fast-check";
import { propertyParameters } from "@opencode-stats/browser-copy/testing";
import { createChangeClock, changes, changeDiagnostics, stateMark } from "./change-time.ts";

afterEach(() => {
  performance.clearMeasures();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function clockFixture() {
  let now = 0;
  const frames: Array<() => void> = [];
  const tasks: Array<() => void> = [];
  const measure = vi.fn<(name: string, options: PerformanceMeasureOptions) => void>();
  const clock = createChangeClock({
    now: () => now,
    frame: (run) => {
      frames.push(run);
    },
    task: (run) => {
      tasks.push(run);
    },
    measure,
  });
  return {
    clock,
    frames,
    tasks,
    measure,
    advance: (work: number) => {
      now += work;
    },
  };
}

it("sums input, worker, page and actual rAF-to-task work, independently of the frame wait", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 10000 }),
      fc.integer({ min: 0, max: 40 }),
      (wait, paint) => {
        const f = clockFixture();
        f.clock.page(
          { kind: "filter", input: 2, compute: 3, page: 1, elapsed: 30, started: 0 },
          () => f.advance(5),
          () => true,
        );
        expect(f.tasks).toHaveLength(0);
        f.advance(wait);
        f.frames[0]!();
        f.advance(paint);
        f.tasks[0]!();
        expect(f.measure).toHaveBeenNthCalledWith(1, "opencode-stats:change:filter", {
          start: 0,
          duration: 11 + paint,
          detail: { input: 2, compute: 3, page: 6, paint },
        });
        expect(f.measure).toHaveBeenNthCalledWith(2, "opencode-stats:input-to-paint:filter", {
          start: 0,
          duration: 5 + wait + paint,
        });
      },
    ),
    propertyParameters,
  );
});

it("never publishes replaced or unmounted complete answers that did not get a frame", () => {
  const f = clockFixture();
  const update = vi.fn<() => void>();
  f.clock.page(
    { kind: "preset", input: 0, compute: 1, page: 0, elapsed: 0, started: 0 },
    update,
    () => false,
  );
  f.frames[0]!();
  expect(update).toHaveBeenCalledOnce();
  expect(f.tasks).toEqual([]);
  expect(f.measure).not.toHaveBeenCalled();
});

it("times local work once, includes nested theme application, returns its value and releases a thrown handler", () => {
  const f = clockFixture();
  expect(() =>
    f.clock.local("theme", () => {
      throw new Error("synthetic");
    }),
  ).toThrow("synthetic");
  expect(
    f.clock.local("theme", () => {
      f.advance(2);
      return f.clock.local("scheme", () => {
        f.advance(3);
        return 42;
      });
    }),
  ).toBe(42);
  expect(f.frames).toHaveLength(1);
  f.advance(1000);
  f.frames[0]!();
  f.advance(4);
  f.tasks[0]!();
  expect(f.measure).toHaveBeenCalledWith("opencode-stats:change:theme", {
    start: 0,
    duration: 9,
    detail: { input: 5, compute: 0, page: 0, paint: 4 },
  });
});

it("the native adapter publishes User Timing after a real MessageChannel task and closes both ports", async () => {
  const frames: FrameRequestCallback[] = [];
  const close = vi.spyOn(MessagePort.prototype, "close");
  vi.stubGlobal("requestAnimationFrame", (run: FrameRequestCallback) => {
    frames.push(run);
    return 1;
  });
  changes.local("search", () => {});
  expect(performance.getEntriesByName("opencode-stats:change:search")).toEqual([]);
  frames[0]!(0);
  await vi.waitFor(() =>
    expect(performance.getEntriesByName("opencode-stats:change:search")).toHaveLength(1),
  );
  expect(close).toHaveBeenCalledTimes(2);
});

it("marks exact drawing objects, not equivalent addresses, copy IDs or post-paint DOM nodes", () => {
  const old = { privateId: "synthetic-private", tokens: 12 };
  const next = { ...old };
  expect(stateMark(old)).toBe(stateMark(old));
  expect(stateMark(next)).not.toBe(stateMark(old));
  expect(Number.isInteger(stateMark(next))).toBe(true);
});

it("coalesces local changes of the same kind before their actual frame, rather than timing an unseen menu/search state", () => {
  const f = clockFixture();
  f.clock.local("search", () => f.advance(2));
  f.clock.local("search", () => f.advance(3));
  f.frames[0]!();
  expect(f.tasks).toHaveLength(0);
  f.frames[1]!();
  f.tasks[0]!();
  expect(f.measure).toHaveBeenCalledTimes(2);
  expect(f.measure).toHaveBeenCalledWith("opencode-stats:change:search", {
    start: 0,
    duration: 5,
    detail: { input: 5, compute: 0, page: 0, paint: 0 },
  });
});

it("adds later native palette work to its theme input, without counting the async wait or emitting a separate scheme change", () => {
  const f = clockFixture();
  f.clock.local("theme", () => f.advance(2));
  f.advance(1000);
  f.clock.appearance("scheme", () => f.advance(3));
  f.frames[0]!();
  f.frames[1]!();
  f.advance(4);
  f.tasks[0]!();
  expect(f.measure).toHaveBeenCalledWith("opencode-stats:change:theme", {
    start: 0,
    duration: 9,
    detail: { input: 2, compute: 0, page: 3, paint: 4 },
  });
  expect(f.measure).toHaveBeenCalledTimes(2);
});

it("discards an unmounted owner's local work, and measures a standalone system scheme application as page work", () => {
  const f = clockFixture();
  f.clock.local("settings", () => f.advance(2));
  f.clock.discard();
  f.frames[0]!();
  expect(f.tasks).toEqual([]);
  f.clock.local("search", () => f.advance(1));
  expect(
    f.clock.appearance("scheme", () => {
      f.advance(3);
      return 7;
    }),
  ).toBe(7);
  f.frames[2]!();
  f.tasks[0]!();
  expect(f.measure).toHaveBeenCalledWith("opencode-stats:change:scheme", {
    start: 3,
    duration: 3,
    detail: { input: 0, compute: 0, page: 3, paint: 0 },
  });
});

it("diagnostics read the same recent User Timing values and disclose only kind/count/median/p95", () => {
  performance.measure("unrelated:synthetic-private", { start: 0, duration: 999 });
  for (let duration = 0; duration <= 100; duration++)
    performance.measure("opencode-stats:change:filter", { start: 0, duration });
  performance.measure("opencode-stats:change:theme", { start: 0, duration: 2 });
  expect(changeDiagnostics()).toEqual([
    { kind: "filter", count: 100, median: 50, p95: 95 },
    { kind: "theme", count: 1, median: 2, p95: 2 },
  ]);
  expect(JSON.stringify(changeDiagnostics())).not.toContain("synthetic-private");
});
