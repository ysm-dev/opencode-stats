import { midnight } from "./calendar.ts";
import type { Period, TimeRange } from "./ranges.ts";
import { presetLabels } from "./ranges.ts";

// English names, but the browser region determines field order and clock cycle.
const regionalEnglish = (locale: string) => {
  const region = new Intl.Locale(locale).maximize().region!;
  return `en-${region}`;
};
export const clockLabel = (instant: number, timeZone: string, locale: string) =>
  new Intl.DateTimeFormat(regionalEnglish(locale), {
    timeZone,
    timeStyle: "short",
    hourCycle: new Intl.DateTimeFormat(locale, { hour: "numeric" }).resolvedOptions().hourCycle,
  }).format(instant);
export const dateLabel = (date: string, locale: string, includeYear = true) => {
  // This is a date label, not an instant: even a skipped local date keeps its name.
  const instant = midnight(date, "UTC");
  const options: Intl.DateTimeFormatOptions = {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
    calendar: "gregory",
    numberingSystem: "latn",
  };
  const english = new Intl.DateTimeFormat("en", options).formatToParts(instant);
  return new Intl.DateTimeFormat(locale, options)
    .formatToParts(instant)
    .filter(
      (part) =>
        part.type === "day" || part.type === "month" || (includeYear && part.type === "year"),
    )
    .map((part) => english.find((field) => field.type === part.type)!.value)
    .join(" ");
};
export const periodLabel = (period: Period, locale: string) =>
  `${dateLabel(period.from, locale)} – ${dateLabel(period.to, locale)}`;
export const rangeLabel = (range: TimeRange, period: Period, locale: string) =>
  typeof range === "string" ? presetLabels[range] : periodLabel(period, locale);
export const summarySpan = (range: TimeRange, period: Period, locale: string) =>
  range === "today"
    ? "today"
    : range === "all"
      ? "over all history"
      : typeof range === "string"
        ? `in the ${presetLabels[range].toLowerCase()}`
        : `from ${periodLabel(period, locale)}`;
export const changeLabel = (current: number, previous: number) => {
  if (previous === 0) return "";
  const percent = ((current - previous) / previous) * 100;
  return `${percent < 0 ? "↓" : "↑"} ${Math.abs(percent).toLocaleString("en", { maximumFractionDigits: 1 })}%`;
};
