import type { EngineClock } from "./clock.ts";

const time = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

export function createLiveStatus(clock: EngineClock) {
  let lastWrite: number | undefined;
  let disconnectedAt: number | undefined;
  let pausedAt: number | undefined;
  let warning = false;
  let announcement = "";
  const read = () => {
    if (pausedAt !== undefined)
      return {
        paused: true,
        liveLabel: "Paused",
        statusLine: `Paused at ${time(pausedAt)}`,
        announcement,
      };
    const stale = disconnectedAt !== undefined && clock.now() - disconnectedAt >= 5000;
    const statusLine = stale
      ? `Not updating since ${time(disconnectedAt!)} · the dashboard server isn't running`
      : "";
    if (stale && !warning) announcement = statusLine;
    if (!stale && warning) announcement = "Up to date again";
    warning = stale;
    const seconds =
      lastWrite === undefined
        ? undefined
        : Math.max(0, Math.floor((clock.now() - lastWrite) / 1000));
    const liveLabel =
      seconds === undefined
        ? "Live"
        : seconds === 0
          ? "Last write just now"
          : `Last write ${seconds} s ago`;
    return {
      paused: false,
      liveLabel: stale ? "Not updating" : liveLabel,
      statusLine,
      announcement,
    };
  };
  return {
    read,
    wrote: () => {
      lastWrite = clock.now();
    },
    disconnect: () => {
      disconnectedAt ??= clock.now();
    },
    connected: () => {
      disconnectedAt = undefined;
    },
    pause: () => {
      pausedAt = clock.now();
    },
    resume: () => {
      pausedAt = undefined;
    },
  };
}
