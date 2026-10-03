// PROTOTYPE: number and date formats. The date/clock style is switchable from the prototype bar
// so the date-format question in issue #14 can be answered by looking.
import { PRESETS, type Range, type Unit, parseDay } from "./data/time";
import { urlParam } from "./state";

export type ClockStyle = "locale" | "24h" | "12h";
export type DateStyle = "locale" | "month-day" | "day-month" | "iso";

const [clock, setClock] = urlParam<ClockStyle>("clock", "locale");
const [dates, setDates] = urlParam<DateStyle>("dates", "locale");
export { clock, dates, setClock, setDates };

const intl = new Intl.NumberFormat("en-US");
const compactFmt = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export const int = (n: number) => intl.format(Math.round(n));
export const compact = (n: number) => (Math.abs(n) < 10000 ? int(n) : compactFmt.format(n));

export function usd(n: number): string {
  if (n === 0) return "$0";
  if (Math.abs(n) < 0.01) return "<$0.01";
  if (Math.abs(n) >= 1000) return `$${intl.format(Math.round(n))}`;
  return `$${n.toFixed(2)}`;
}

export const pct = (x: number | null, digits = 1) =>
  x === null || Number.isNaN(x) ? "–" : `${(x * 100).toFixed(digits)}%`;

export function duration(ms: number | null): string {
  if (ms === null || Number.isNaN(ms)) return "–";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return s ? `${m}m ${s}s` : `${m}m`;
}

/** Relative change against the previous period. Null when there's nothing to compare. */
export function change(cur: number | null, prev: number | null | undefined): number | null {
  if (cur === null || prev === null || prev === undefined || prev === 0) return null;
  return (cur - prev) / prev;
}

export function changeText(c: number | null): string {
  if (c === null) return "";
  const arrow = c > 0.0005 ? "↑" : c < -0.0005 ? "↓" : "→";
  const v = Math.abs(c * 100);
  return `${arrow} ${v >= 100 ? Math.round(v) : v.toFixed(v < 10 ? 1 : 0)}%`;
}

// "Follow the browser" (decided in #14): take day/month order and the clock from the browser's
// region, but always write English, since the UI is English-only.
const browserLocale = typeof navigator === "undefined" ? "en-US" : navigator.language;
const browserDayFirst = (() => {
  const parts = new Intl.DateTimeFormat(browserLocale, {
    month: "short",
    day: "numeric",
  }).formatToParts(new Date(2026, 9, 2));
  return parts.findIndex((p) => p.type === "day") < parts.findIndex((p) => p.type === "month");
})();
const browserHour12 =
  new Intl.DateTimeFormat(browserLocale, { hour: "numeric" }).resolvedOptions().hour12 ?? false;

function locale(): string {
  const d = dates();
  if (d === "month-day") return "en-US";
  if (d === "day-month") return "en-GB";
  return browserDayFirst ? "en-GB" : "en-US";
}

function hour12(): boolean {
  const c = clock();
  return c === "locale" ? browserHour12 : c === "12h";
}

function iso(t: number, withYear: boolean): string {
  const d = new Date(t);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return withYear ? `${d.getFullYear()}-${mm}-${dd}` : `${mm}-${dd}`;
}

export function day(t: number, opts: { year?: boolean; weekday?: boolean } = {}): string {
  if (dates() === "iso") return `${opts.weekday ? `${weekday(t)} ` : ""}${iso(t, !!opts.year)}`;
  return new Intl.DateTimeFormat(locale(), {
    month: "short",
    day: "numeric",
    year: opts.year ? "numeric" : undefined,
    weekday: opts.weekday ? "short" : undefined,
  }).format(t);
}

export const weekday = (t: number) =>
  new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(t);

export function month(t: number, year = true): string {
  if (dates() === "iso") return iso(t, true).slice(0, year ? 7 : 7);
  return new Intl.DateTimeFormat(locale(), {
    month: "short",
    year: year ? "numeric" : undefined,
  }).format(t);
}

export function time(t: number): string {
  return new Intl.DateTimeFormat(locale(), {
    hour: "numeric",
    minute: "2-digit",
    hour12: hour12(),
  }).format(t);
}

export function hour(t: number): string {
  if (hour12())
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: true })
      .format(t)
      .replace(" ", "");
  return `${String(new Date(t).getHours()).padStart(2, "0")}:00`;
}

export function dateTime(t: number): string {
  return `${day(t, { year: new Date(t).getFullYear() !== new Date().getFullYear() })}, ${time(t)}`;
}

/** Short label for a bucket on an axis. */
export function bucketLabel(t: number, unit: Unit): string {
  if (unit === "hour") return hour(t);
  if (unit === "month") return month(t, false);
  return day(t);
}

/** Full label for a bucket in a tooltip. */
export function bucketTitle(start: number, end: number, unit: Unit): string {
  if (unit === "hour") return `${day(start, { weekday: true })}, ${time(start)}–${time(end)}`;
  if (unit === "day") return day(start, { weekday: true, year: true });
  if (unit === "week") return `Week of ${day(start, { year: true })}`;
  return month(start);
}

export function rangeLabel(r: Range): string {
  const spec = r.spec;
  if (spec.kind === "preset") return PRESETS.find((p) => p.id === spec.preset)!.long;
  const start = parseDay(spec.start);
  if (spec.unit === "day") return day(start, { weekday: true, year: true });
  if (spec.unit === "week") return `Week of ${day(start, { year: true })}`;
  if (spec.unit === "month") return month(start);
  return `${day(start)} – ${day(r.axisEnd - 1, { year: true })}`;
}

/** "vs previous 7 days" style caption for changes. */
export function previousLabel(r: Range): string {
  const spec = r.spec;
  if (spec.kind === "preset") {
    if (spec.preset === "today") return "vs yesterday";
    return `vs previous ${r.days} days`;
  }
  if (spec.unit === "day") return "vs day before";
  if (spec.unit === "days") return `vs previous ${spec.days} days`;
  return `vs previous ${spec.unit}`;
}
