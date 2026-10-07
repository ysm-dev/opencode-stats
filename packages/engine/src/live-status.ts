import type { EngineClock } from "./clock.ts";
import { clockLabel, dateLabel } from "./time-labels.ts";
import { localDate } from "./calendar.ts";
import { stopReason, type SyncStop } from "@opencode-stats/browser-copy/api";

function statusStamp(since: number | undefined, clock: EngineClock) {
  if (since === undefined) return "";
  const date = localDate(since, clock.timeZone());
  const prefix =
    date === localDate(clock.now(), clock.timeZone()) ? "" : `${dateLabel(date, clock.locale())}, `;
  return `${prefix}${clockLabel(since, clock.timeZone(), clock.locale())}`;
}

function lastWriteLabel(lastWrite: number | undefined, now: number) {
  if (lastWrite === undefined) return "Live";
  const seconds = Math.max(0, Math.floor((now - lastWrite) / 1000));
  return seconds === 0 ? "Last write just now" : `Last write ${seconds} s ago`;
}

export function createLiveStatus(clock: EngineClock, formatAnnouncement: (line: string) => string) {
  const time = (timestamp: number) => clockLabel(timestamp, clock.timeZone(), clock.locale());
  let lastWrite: number | undefined;
  let disconnectedAt: number | undefined;
  let pausedAt: number | undefined;
  let pausedClock = "";
  let resuming = false;
  let warning = "";
  let stop: SyncStop | null = null;
  let announcement = "";
  const read = () => {
    const stale = disconnectedAt !== undefined && clock.now() - disconnectedAt >= 5000;
    if (pausedAt !== undefined && (!resuming || !stale))
      return {
        paused: true,
        liveLabel: "Paused",
        statusLine: `Paused at ${pausedClock}`,
        announcement,
        ...(stop ? { stop } : {}),
      };
    const since = stale ? disconnectedAt! : stop?.since;
    const stamp = statusStamp(since, clock);
    const statusLine = stale
      ? `Not updating since ${stamp} · the dashboard server isn't running`
      : stop
        ? `Not updating since ${stamp} · ${stopReason(stop, time)}`
        : "";
    const key = stale ? "server" : stop ? stopReason(stop, String) : "";
    if (key && key !== warning) announcement = formatAnnouncement(statusLine);
    if (!key && warning) announcement = "Up to date again";
    warning = key;
    const liveLabel = lastWriteLabel(lastWrite, clock.now());
    return {
      paused: false,
      liveLabel: key ? "Not updating" : liveLabel,
      statusLine,
      announcement,
      ...(stop ? { stop } : {}),
    };
  };
  return {
    read,
    syncStop: (value: SyncStop | null) => {
      stop = value;
    },
    wrote: () => {
      lastWrite = clock.now();
    },
    disconnect: () => {
      disconnectedAt ??= clock.now();
    },
    connected: () => {
      disconnectedAt = undefined;
      pausedAt = undefined;
      resuming = false;
    },
    pause: () => {
      pausedAt = clock.now();
      pausedClock = time(pausedAt);
      resuming = false;
    },
    retry: () => {
      resuming = true;
    },
  };
}
