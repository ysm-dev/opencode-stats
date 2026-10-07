import { formatVersion } from "@opencode-stats/browser-copy";
import type { CopyCursor, LiveAnnouncement } from "@opencode-stats/browser-copy/api";
import type { EngineClock } from "./clock.ts";
import type { EngineSignal } from "./protocol.ts";
import type { ChangeKind } from "./change.ts";
import { followCopy, loadCopy, type EngineNetwork } from "./network.ts";
import { createHistoryCopy } from "./history-copy.ts";
import { createLiveStatus } from "./live-status.ts";
import { addDates, localDate, midnight } from "./calendar.ts";
import { historyLine } from "./history.ts";
import { dateLabel } from "./time-labels.ts";

type Session = {
  controller: AbortController;
  stopStream?: () => Promise<void>;
  work?: Promise<void> | undefined;
  target?: LiveAnnouncement | undefined;
  opening: boolean;
  kind: ChangeKind;
};

const timeKey = (value: { now: number; timeZone: string; locale: string }) =>
  `${Math.floor(value.now / 60000)}\0${value.timeZone}\0${value.locale}\0${localDate(value.now, value.timeZone)}`;
const readTime = (clock: EngineClock) => ({
  now: clock.now(),
  timeZone: clock.timeZone(),
  locale: clock.locale(),
});
type LiveStatus = ReturnType<typeof createLiveStatus>;
const unchangedStop = (wanted: LiveAnnouncement, status: LiveStatus) =>
  !("stop" in wanted) ||
  JSON.stringify(wanted.stop ?? null) === JSON.stringify(status.read().stop ?? null);
const liveKind = (
  kind: ChangeKind,
  completedBefore: boolean | undefined,
  completedNow: boolean | undefined,
): ChangeKind => (kind === "live" && (!completedBefore || !completedNow) ? "build" : kind);
function receivedStatus(
  status: LiveStatus,
  wanted: LiveAnnouncement,
  canPaint: boolean,
  wrote: boolean,
) {
  // Recovery belongs to the paint exposing the recovered copy, not an incoming
  // generation whose history still fails today's barrier.
  if ("stop" in wanted && (wanted.stop || canPaint)) status.syncStop(wanted.stop ?? null);
  if (wrote) status.wrote();
  status.connected();
}

export function createLiveEngine(
  network: EngineNetwork,
  clock: EngineClock,
  paint: (kind: ChangeKind, work: number, elapsed: number) => void,
  reload: () => void,
) {
  let readyWork = 0;
  let readyStarted: number | undefined;
  const copies = createHistoryCopy(clock);
  const facts = copies.view;
  const status = createLiveStatus(clock, (line) => {
    const current = facts.current();
    if (!current || !facts.ready()) return line;
    const zone = clock.timeZone();
    const date = dateLabel(
      localDate(facts.history(clock.now(), zone), zone),
      clock.locale(),
      false,
    );
    return historyLine(current.historyComplete, date, line, false);
  });
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
  let time = readTime(clock);
  const updateTime = (force = false) => {
    const next = readTime(clock);
    if (!force && timeKey(next) === timeKey(time)) return false;
    time = next;
    copies.refresh();
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
    if (
      !(await copies.apply(
        await loadCopy(network, clock, addWork, cursor, signal),
        signal,
        addWork,
      )) &&
      !signal.aborted
    )
      await copies.apply(
        await loadCopy(network, clock, addWork, undefined, signal),
        signal,
        addWork,
      );
    if (!signal.aborted) {
      copies.refresh();
      readyWork += ownWork;
      readyStarted ??= workStarted;
    }
  };
  const catchUp = async (current: Session) => {
    while (current.target) {
      const wanted = current.target;
      current.target = undefined;
      const before = copies.received();
      const newer =
        !before || wanted.generation !== before.generation || wanted.revision > before.revision;
      if (!newer && !current.opening && unchangedStop(wanted, status)) continue;
      if (newer || current.opening)
        await apply(current, wanted.generation === before?.generation ? before : undefined);
      if (session !== current) return;
      current.opening = false;
      receivedStatus(status, wanted, copies.canPaint(), newer && !!before);
      if (copies.canPaint() || status.read().liveLabel === "Not updating")
        changed(liveKind(current.kind, before?.historyComplete, facts.current()?.historyComplete));
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
    ...facts,
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
