import * as Schema from "effect/Schema";
import { addDates, dateCount, localDate, midnight } from "./calendar.ts";

export const Preset = Schema.Literals(["today", "7d", "30d", "90d", "180d", "365d", "all"]);
export type Preset = typeof Preset.Type;
export type CalendarUnit = "day" | "week" | "month";
export type TimeRange = Preset | { from: string; to: string; kind?: CalendarUnit | undefined };
export type Period = { start: number; end: number; from: string; to: string; days: number };
export const presetLabels: Record<Preset, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "180d": "Last 180 days",
  "365d": "Last 365 days",
  all: "All time",
};
export const presets: readonly Preset[] = ["today", "7d", "30d", "90d", "180d", "365d", "all"];
const DateInput = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/));
const dateInput = Schema.decodeUnknownSync(DateInput);
const parseDate = (input: string | null) => {
  const value = dateInput(input);
  if (addDates(value, 0) !== value) throw new Error("Invalid local date");
  return value;
};

export function parseRange(address: string, baseUrl: string): TimeRange {
  const url = new URL(address, baseUrl);
  if (url.origin !== new URL(baseUrl).origin || url.pathname !== "/")
    throw new Error("Invalid address");
  for (const key of ["range", "from", "to", "kind"]) {
    if (url.searchParams.getAll(key).length > 1) throw new Error("Duplicate range parameter");
  }
  const range = url.searchParams.get("range");
  if (range !== "fixed") {
    if (url.searchParams.has("from") || url.searchParams.has("to") || url.searchParams.has("kind"))
      throw new Error("Unexpected dates");
    return range === null ? "30d" : Schema.decodeUnknownSync(Preset)(range);
  }
  const from = parseDate(url.searchParams.get("from"));
  const to = parseDate(url.searchParams.get("to"));
  if (from > to) throw new Error("Reversed range");
  const kind = url.searchParams.get("kind");
  return kind === null ? { from, to } : fixedKind(from, to, kind);
}

function fixedKind(from: string, to: string, input: string): Exclude<TimeRange, string> {
  const kind = Schema.decodeUnknownSync(Schema.Literals(["day", "week", "month"]))(input);
  const days = dateCount(from, to);
  const calendarMonth = shiftMonth({ from, to }, 0);
  const valid =
    kind === "day"
      ? days === 1
      : kind === "week"
        ? days === 7 && new Date(`${from}T00:00Z`).getUTCDay() === 1
        : from === calendarMonth.from && to === calendarMonth.to;
  if (!valid) throw new Error("Invalid fixed range kind");
  return { from, to, kind };
}

export const rangeAddress = (range: TimeRange) =>
  typeof range === "string"
    ? `/?range=${range}`
    : `/?range=fixed&from=${range.from}&to=${range.to}${range.kind ? `&kind=${range.kind}` : ""}`;

export function resolveRange(
  range: TimeRange,
  now: number,
  timeZone: string,
  history: number,
): Period {
  const today = localDate(now, timeZone);
  const days =
    typeof range === "string"
      ? range === "today"
        ? 1
        : Number.parseInt(range)
      : dateCount(range.from, range.to);
  const from =
    typeof range === "string"
      ? range === "all"
        ? localDate(history, timeZone)
        : addDates(today, 1 - days)
      : range.from;
  const to = typeof range === "string" ? today : range.to;
  return {
    from,
    to,
    days: range === "all" ? dateCount(from, to) : days,
    start: range === "all" ? history : midnight(from, timeZone),
    end: Math.min(now, midnight(addDates(to, 1), timeZone)),
  };
}

export function normalizeRange(range: TimeRange, now: number, timeZone: string): TimeRange {
  if (typeof range === "string" || range.to !== localDate(now, timeZone)) return range;
  const days = dateCount(range.from, range.to);
  return (
    presets.find((key) => key !== "all" && (key === "today" ? 1 : Number.parseInt(key)) === days) ??
    range
  );
}

export function calendarRange(date: string, unit: CalendarUnit): Exclude<TimeRange, string> {
  date = parseDate(date);
  const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  const from =
    unit === "month" ? `${date.slice(0, 7)}-01` : unit === "week" ? addDates(date, -weekday) : date;
  const nextMonth = new Date(`${from}T00:00:00Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const to =
    unit === "month"
      ? addDates(nextMonth.toISOString().slice(0, 10), -1)
      : addDates(from, unit === "week" ? 6 : 0);
  return { from, to, kind: unit };
}

export function shiftRange(
  range: TimeRange,
  direction: -1 | 1,
  now: number,
  timeZone: string,
): TimeRange {
  if (range === "all") return range;
  const period = resolveRange(range, now, timeZone, now);
  const next =
    typeof range !== "string" && range.kind === "month"
      ? shiftMonth(range, direction)
      : {
          from: addDates(period.from, direction * period.days),
          to: addDates(period.to, direction * period.days),
          ...(typeof range === "string" ? {} : { kind: range.kind }),
        };
  if (direction === 1 && next.from > localDate(now, timeZone)) return range;
  return normalizeRange(next, now, timeZone);
}

function shiftMonth(
  range: Exclude<TimeRange, string>,
  direction: number,
): Exclude<TimeRange, string> {
  const date = new Date(`${range.from}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + direction, 1);
  const from = date.toISOString().slice(0, 10);
  date.setUTCMonth(date.getUTCMonth() + 1, 1);
  return { from, to: addDates(date.toISOString().slice(0, 10), -1), kind: "month" };
}

export function previousPeriod(
  range: TimeRange,
  period: Period,
  timeZone: string,
  history: number,
): Period | null {
  if (range === "all") return null;
  const before =
    typeof range !== "string" && range.kind === "month"
      ? shiftMonth(range, -1)
      : { from: addDates(period.from, -period.days), to: addDates(period.to, -period.days) };
  const { from, to } = before;
  const start = midnight(from, timeZone);
  if (start < history) return null;
  const end = midnight(addDates(to, 1), timeZone);
  const running = period.end < midnight(addDates(period.to, 1), timeZone);
  return {
    from,
    to,
    days: dateCount(from, to),
    start,
    end: running ? Math.min(end, start + Math.max(0, period.end - period.start)) : end,
  };
}
