import type { ChangeTime } from "@opencode-stats/engine";

type Parts = { input: number; compute: number; page: number; paint: number };
type LocalKind =
  | "range-menu"
  | "settings-menu"
  | "settings"
  | "theme"
  | "scheme"
  | "system-scheme"
  | "resize"
  | "shortcuts"
  | "search"
  | "expand-checklist";
type Tools = {
  now: () => number;
  frame: (run: () => void) => void;
  task: (run: () => void) => void;
  measure: (name: string, options: PerformanceMeasureOptions) => void;
};
const browserTools: Tools = {
  now: () => performance.now(),
  frame: (run) => {
    requestAnimationFrame(run);
  },
  task: (run) => {
    const channel = new MessageChannel();
    channel.port1.addEventListener("message", () => {
      channel.port1.close();
      channel.port2.close();
      run();
    });
    channel.port1.start();
    channel.port2.postMessage(null);
  },
  measure: (name, options) => {
    performance.measure(name, options);
  },
};

export function createChangeClock(tools: Tools = browserTools) {
  let handling = false;
  const localParts = new Map<LocalKind, { started: number; parts: Parts }>();
  const finish = (
    kind: ChangeTime["kind"] | LocalKind,
    started: number,
    parts: Parts,
    current: () => boolean,
  ) => {
    tools.frame(() => {
      if (!current()) return;
      // Begin inside rAF, not at registration: frame scheduling is not our work.
      const paintStarted = tools.now();
      tools.task(() => {
        parts.paint = tools.now() - paintStarted;
        const duration = parts.input + parts.compute + parts.page + parts.paint;
        tools.measure(`opencode-stats:change:${kind}`, { start: started, duration, detail: parts });
        tools.measure(`opencode-stats:input-to-paint:${kind}`, {
          start: started,
          duration: tools.now() - started,
        });
      });
    });
  };
  const local = <T>(kind: LocalKind, update: () => T, phase: "input" | "page" = "input"): T => {
    if (handling) return update();
    const started = tools.now();
    handling = true;
    let value: T;
    try {
      value = update();
    } finally {
      handling = false;
    }
    const previous = localParts.get(kind);
    const parts = {
      input: previous?.parts.input ?? 0,
      compute: 0,
      page: previous?.parts.page ?? 0,
      paint: 0,
    };
    parts[phase] += tools.now() - started;
    const change = { started: previous?.started ?? started, parts };
    localParts.delete(kind);
    localParts.set(kind, change);
    finish(kind, change.started, change.parts, () => {
      if (localParts.get(kind) !== change) return false;
      localParts.delete(kind);
      return true;
    });
    return value;
  };
  return {
    local,
    discard: () => {
      localParts.clear();
    },
    // The native provider may apply CSS in a later microtask. Attribute its own
    // palette work to the pending theme/scheme input, without counting that wait.
    appearance: <T>(kind: "theme" | "scheme" | "system-scheme", update: () => T): T => {
      const pending = [...localParts.keys()].findLast(
        (candidate) => candidate === "theme" || candidate === "scheme",
      );
      return local(pending ?? kind, update, "page");
    },
    page: (timing: ChangeTime, update: () => void, current: () => boolean) => {
      const started = tools.now();
      handling = true;
      try {
        update();
      } finally {
        handling = false;
      }
      finish(
        timing.kind,
        timing.started,
        {
          input: timing.input,
          compute: timing.compute,
          page: timing.page + tools.now() - started,
          paint: 0,
        },
        current,
      );
    },
  };
}
export const changes = createChangeClock();

// A mark belongs to the exact immutable object read by the drawing expression.
// It reveals only a tab-local serial, never a range/filter, copy ID or metric.
const marks = new WeakMap<object, number>();
let serial = 0;
export function stateMark(state: object): number {
  let mark = marks.get(state);
  if (mark === undefined) {
    mark = ++serial;
    marks.set(state, mark);
  }
  return mark;
}

export function changeDiagnostics() {
  const groups = new Map<string, number[]>();
  for (const entry of performance.getEntriesByType("measure")) {
    if (!entry.name.startsWith("opencode-stats:change:")) continue;
    const times = groups.get(entry.name) ?? [];
    times.push(entry.duration);
    groups.set(entry.name, times.slice(-100));
  }
  return [...groups].map(([kind, times]) => {
    times.sort((a, b) => a - b);
    return {
      kind: kind.slice("opencode-stats:change:".length),
      count: times.length,
      median: times[Math.ceil(times.length / 2) - 1]!,
      p95: times[Math.ceil(times.length * 0.95) - 1]!,
    };
  });
}
