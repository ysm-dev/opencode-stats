import { formatVersion } from "@opencode-stats/browser-copy";
import type { CopyCursor, LiveAnnouncement } from "@opencode-stats/browser-copy/api";
import type { EngineClock } from "./clock.ts";
import type { EngineSignal } from "./protocol.ts";
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
};

export function createLiveEngine(
  network: EngineNetwork,
  clock: EngineClock,
  paint: () => void,
  reload: () => void,
) {
  const facts = createFacts(clock);
  const status = createLiveStatus(clock);
  let session: Session | undefined;
  let visible = true;
  let paused = false;
  let started = false;
  let closed = false;
  let replaceRelease = false;
  let stopClock: (() => void) | undefined;
  let stopBoundary: (() => void) | undefined;
  let stopRetry: (() => void) | undefined;
  let presented = "";
  const readTime = () => ({ now: clock.now(), timeZone: clock.timeZone(), locale: clock.locale() });
  let time = readTime();
  const timeKey = (value: typeof time) =>
    `${Math.floor(value.now / 60000)}\0${value.timeZone}\0${value.locale}\0${localDate(value.now, value.timeZone)}`;
  const updateTime = (force = false) => {
    const next = readTime();
    if (!force && timeKey(next) === timeKey(time)) return false;
    time = next;
    return true;
  };
  const cleanups = new Set<Promise<void>>();
  const enabled = () => started && visible && !paused && !closed;
  const changed = () => {
    if (!paused) updateTime(true);
    presented = JSON.stringify(status.read());
    paint();
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
    const signal = current.controller.signal;
    const copy = await loadCopy(network, cursor, signal);
    if (!(await facts.apply(copy, signal)) && !signal.aborted) {
      await facts.apply(await loadCopy(network, undefined, signal), signal);
    }
  };
  const catchUp = async (current: Session) => {
    while (current.target) {
      const wanted = current.target;
      current.target = undefined;
      const before = facts.current();
      const newer =
        !before || wanted.generation !== before.generation || wanted.revision > before.revision;
      if (!newer && !current.opening) continue;
      await apply(current, wanted.generation === before?.generation ? before : undefined);
      if (session !== current) return;
      current.opening = false;
      if (newer && before) status.wrote();
      status.connected();
      changed();
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
    const current: Session = { controller: new AbortController(), opening: !!facts.current() };
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
          changed();
          openStream(current);
        });
    }
  };
  const tick = () => {
    if (
      facts.current() &&
      !session?.opening &&
      (updateTime() || JSON.stringify(status.read()) !== presented)
    )
      changed();
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
    started = true;
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
    if (event.kind === "focus") {
      connect();
      if (enabled() && facts.current() && !session?.opening && updateTime(true)) changed();
      return;
    }
    if (event.kind === "visibility") {
      visible = event.visible;
      if (!visible && replaceRelease) reload();
    } else {
      if (event.paused && enabled()) updateTime(true);
      paused = event.paused;
      if (paused) {
        status.pause();
        changed();
      } else status.retry();
    }
    if (enabled()) start();
    else suspend();
  };
  return {
    current: facts.current,
    query: facts.query,
    history: facts.history,
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
