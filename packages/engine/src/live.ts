import { formatVersion, type BrowserCopy } from "@opencode-stats/browser-copy";
import type { CopyCursor, LiveAnnouncement } from "@opencode-stats/browser-copy/api";
import type { EngineClock } from "./clock.ts";
import type { EngineSignal } from "./protocol.ts";
import type { ChangeKind } from "./change.ts";
import { followCopy, loadCopy, type EngineNetwork } from "./network.ts";
import { createFacts } from "./tokens.ts";
import { createLiveStatus } from "./live-status.ts";
import { addDates, localDate, midnight } from "./calendar.ts";

type Session = {
  controller: AbortController;
  stopStream?: () => Promise<void>;
  work?: Promise<void> | undefined;
  target?: CopyCursor | undefined;
  opening: boolean;
  kind: ChangeKind;
};

const timeKey = (value: { now: number; timeZone: string; locale: string }) =>
  `${Math.floor(value.now / 60000)}\0${value.timeZone}\0${value.locale}\0${localDate(value.now, value.timeZone)}`;

export function createLiveEngine(
  network: EngineNetwork,
  clock: EngineClock,
  paint: (kind: ChangeKind, work: number, elapsed: number) => void,
  reload: () => void,
) {
  let readyWork = 0;
  let readyStarted: number | undefined;
  let facts = createFacts(clock);
  let incoming: ReturnType<typeof createFacts> | undefined;
  let ready = false;
  const status = createLiveStatus(clock);
  let session: Session | undefined;
  let visible = true;
  let paused = false;
  let hasStarted = false;
  let closed = false;
  let replaceRelease = false;
  let stopClock: (() => void) | undefined;
  let stopBoundary: (() => void) | undefined;
  let stopRetry: (() => void) | undefined;
  let presented = "";
  let nextKind: ChangeKind = "live";
  const readTime = () => ({ now: clock.now(), timeZone: clock.timeZone(), locale: clock.locale() });
  let time = readTime();
  const refreshReadiness = () => {
    if (incoming?.current() && incoming.coversToday()) {
      facts = incoming;
      incoming = undefined;
    }
    if (facts.current()) ready ||= facts.coversToday();
  };
  const updateTime = (force = false) => {
    const next = readTime();
    if (!force && timeKey(next) === timeKey(time)) return false;
    time = next;
    refreshReadiness();
    return true;
  };
  const cleanups = new Set<Promise<void>>();
  const enabled = () => hasStarted && visible && !paused && !closed;
  const changed = (kind: ChangeKind, priorWork = 0) => {
    const started = clock.workNow();
    if (!paused) updateTime(true);
    presented = JSON.stringify(status.read());
    const background =
      kind === "live" || kind === "build" || kind === "resume" || kind === "visible";
    const work = (background ? readyWork : 0) + priorWork + clock.workNow() - started;
    const elapsed =
      clock.workNow() - (background ? (readyStarted ?? started) : started) + priorWork;
    if (background) {
      readyWork = 0;
      readyStarted = undefined;
    }
    paint(kind, work, elapsed);
  };
  const disconnect = () => {
    const previous = session;
    session = undefined;
    previous?.controller.abort();
    const cleanup = Promise.all([previous?.stopStream?.(), previous?.work]).then(() => undefined);
    cleanups.add(cleanup);
    void cleanup.finally(() => cleanups.delete(cleanup));
  };
  const failed = (current: Session) => {
    if (session !== current) return;
    status.disconnect();
    disconnect();
    stopRetry = clock.after(2000, connect);
  };
  const apply = async (current: Session, cursor?: CopyCursor) => {
    let ownWork = 0;
    let workStarted: number | undefined;
    const addWork = (work: number, started = clock.workNow()) => {
      ownWork += work;
      workStarted ??= started;
    };
    const signal = current.controller.signal;
    const install = (copy: BrowserCopy) => {
      if (
        copy.kind === "whole" &&
        facts.current() &&
        copy.generation !== facts.current()!.generation
      )
        incoming = createFacts(clock);
      return (incoming ?? facts).apply(copy, signal, addWork);
    };
    if (
      !(await install(await loadCopy(network, clock, addWork, cursor, signal))) &&
      !signal.aborted
    )
      await install(await loadCopy(network, clock, addWork, undefined, signal));
    if (!signal.aborted) {
      refreshReadiness();
      readyWork += ownWork;
      readyStarted ??= workStarted;
    }
  };
  const catchUp = async (current: Session) => {
    while (current.target) {
      const wanted = current.target;
      current.target = undefined;
      const before = (incoming ?? facts).current();
      const newer =
        !before || wanted.generation !== before.generation || wanted.revision > before.revision;
      if (!newer && !current.opening) continue;
      await apply(current, wanted.generation === before?.generation ? before : undefined);
      if (session !== current) return;
      current.opening = false;
      if (newer && before) status.wrote();
      status.connected();
      if (!incoming && ready)
        changed(
          current.kind === "live" && (!before?.historyComplete || !facts.current()!.historyComplete)
            ? "build"
            : current.kind,
        );
      current.kind = "live";
    }
  };
  const wake = (current: Session) => {
    if (current.work || !current.target || session !== current) return;
    current.work = catchUp(current)
      .catch(() => failed(current))
      .finally(() => {
        current.work = undefined;
        wake(current);
      });
  };
  const announce = (current: Session, event: LiveAnnouncement) => {
    // Stream callbacks are synchronous; interrupting the fiber stops their delivery.
    if ("format" in event) {
      if (event.format !== formatVersion) {
        closed = true;
        suspend();
        reload();
        return;
      }
      replaceRelease ||= event.release !== network.release;
    }
    current.target = event;
    wake(current);
  };
  const openStream = (current: Session) => {
    current.stopStream = followCopy(
      network,
      (event) => announce(current, event),
      () => failed(current),
    );
  };
  const connect = () => {
    if (!enabled() || session) return;
    stopRetry?.();
    stopRetry = undefined;
    const current: Session = {
      controller: new AbortController(),
      opening: !!facts.current(),
      kind: nextKind,
    };
    nextKind = "live";
    session = current;
    if (facts.current()) openStream(current);
    else {
      current.work = apply(current)
        .catch(() => {
          if (session === current) status.disconnect();
        })
        .finally(() => {
          current.work = undefined;
          if (session !== current) return;
          if (facts.current()) {
            status.connected();
          }
          changed(current.kind);
          openStream(current);
        });
    }
  };
  const tick = () => {
    const started = clock.workNow();
    const day = localDate(time.now, time.timeZone);
    if (
      facts.current() &&
      !session?.opening &&
      (updateTime() || JSON.stringify(status.read()) !== presented)
    )
      changed(
        day === localDate(time.now, time.timeZone) ? "minute" : "day",
        clock.workNow() - started,
      );
  };
  const boundary = () => {
    const now = clock.now();
    const nextMinute = (Math.floor(now / 60000) + 1) * 60000;
    const nextDay = midnight(addDates(localDate(now, clock.timeZone()), 1), clock.timeZone());
    stopBoundary = clock.after(Math.min(nextMinute, nextDay) - now, () => {
      tick();
      boundary();
    });
  };
  const start = () => {
    hasStarted = true;
    if (!enabled()) return;
    stopClock ??= clock.everySecond(tick);
    if (!stopBoundary) boundary();
    connect();
  };
  const suspend = () => {
    stopClock?.();
    stopClock = undefined;
    stopBoundary?.();
    stopBoundary = undefined;
    stopRetry?.();
    stopRetry = undefined;
    disconnect();
  };
  const signal = (event: EngineSignal) => {
    const started = clock.workNow();
    if (event.kind === "focus") {
      connect();
      if (enabled() && facts.current() && !session?.opening && updateTime(true))
        changed("focus", clock.workNow() - started);
      return;
    }
    if (event.kind === "visibility") {
      if (event.visible && !visible) nextKind = "visible";
      visible = event.visible;
      if (!visible && replaceRelease) reload();
    } else {
      if (event.paused && enabled()) updateTime(true);
      paused = event.paused;
      if (paused) {
        status.pause();
        changed("pause", clock.workNow() - started);
      } else {
        nextKind = "resume";
        status.retry();
      }
    }
    if (enabled()) start();
    else suspend();
  };
  return {
    current: () => facts.current(),
    ready: () => ready,
    query: (...args: Parameters<typeof facts.query>) => facts.query(...args),
    filterState: (...args: Parameters<typeof facts.filterState>) => facts.filterState(...args),
    filterLabel: (...args: Parameters<typeof facts.filterLabel>) => facts.filterLabel(...args),
    history: (...args: Parameters<typeof facts.history>) => facts.history(...args),
    time: () => time,
    refreshTime: () => {
      if (enabled()) updateTime(true);
    },
    status: status.read,
    visible: () => visible,
    start,
    signal,
    dispose: async () => {
      closed = true;
      suspend();
      await Promise.all(cleanups);
    },
  };
}
