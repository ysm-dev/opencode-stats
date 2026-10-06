import { formatVersion } from "@opencode-stats/browser-copy";
import type { CopyCursor, LiveAnnouncement } from "@opencode-stats/browser-copy/api";
import type { EngineClock } from "./clock.ts";
import type { EngineSignal } from "./protocol.ts";
import { followCopy, loadCopy, type EngineNetwork } from "./network.ts";
import { createFacts } from "./tokens.ts";
import { createLiveStatus } from "./live-status.ts";

type Session = {
  controller: AbortController;
  stopStream?: () => Promise<void>;
  work?: Promise<void>;
  target?: CopyCursor;
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
  let lastAttempt = 0;
  let stopClock: (() => void) | undefined;
  let presented = "";
  const cleanups = new Set<Promise<void>>();
  const enabled = () => started && visible && !paused && !closed;
  const changed = () => {
    presented = JSON.stringify(status.read());
    paint();
  };
  const disconnect = () => {
    const previous = session;
    session = undefined;
    previous?.controller.abort();
    const cleanup = Promise.all([previous?.stopStream?.(), previous?.work]).then(() => {});
    cleanups.add(cleanup);
    void cleanup.finally(() => cleanups.delete(cleanup));
  };
  const failed = (current: Session) => {
    if (session !== current) return;
    status.disconnect();
    lastAttempt = clock.now();
    disconnect();
  };
  const apply = async (current: Session, cursor?: CopyCursor) => {
    const signal = current.controller.signal;
    const copy = await loadCopy(network, cursor, signal);
    if (!(await facts.apply(copy, signal)) && !signal.aborted) {
      await facts.apply(await loadCopy(network, undefined, signal), signal);
    }
  };
  const catchUp = async (current: Session) => {
    while (current.target && session === current) {
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
      status.resume();
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
    if (session !== current) return;
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
    lastAttempt = clock.now();
    const current: Session = { controller: new AbortController(), opening: !!facts.current() };
    session = current;
    if (facts.current()) openStream(current);
    else {
      current.work = apply(current)
        .catch(() => status.disconnect())
        .finally(() => {
          current.work = undefined;
          if (session !== current) return;
          if (facts.current()) {
            status.connected();
            status.resume();
          }
          changed();
          openStream(current);
        });
    }
  };
  const tick = () => {
    if (JSON.stringify(status.read()) !== presented) changed();
    if (!session && clock.now() - lastAttempt >= 2000) connect();
  };
  const start = () => {
    started = true;
    if (!enabled()) return;
    stopClock ??= clock.everySecond(tick);
    connect();
  };
  const suspend = () => {
    stopClock?.();
    stopClock = undefined;
    disconnect();
  };
  const signal = (event: EngineSignal) => {
    if (event.kind === "focus") {
      connect();
      return;
    }
    if (event.kind === "visibility") {
      visible = event.visible;
      if (!visible && replaceRelease) reload();
    } else {
      paused = event.paused;
      if (paused) {
        status.pause();
        changed();
      }
    }
    if (enabled()) start();
    else suspend();
  };
  return {
    current: facts.current,
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
