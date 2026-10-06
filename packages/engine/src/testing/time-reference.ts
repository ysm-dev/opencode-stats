import type { Step } from "@opencode-stats/browser-copy";
import { referenceTokens } from "./reference.ts";

export const referenceDate = (instant: number, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const field = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)!.value;
  return `${field("year")}-${field("month")}-${field("day")}`;
};
export const referenceAdd = (date: string, days: number) =>
  new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);

// Search for the first instant of a local date using only Intl's calendar.
// No Effect construction, timezone offset conversion, or engine arithmetic.
export function referenceMidnight(date: string, timeZone: string) {
  let low = Date.parse(date) - 2 * 86400000;
  let high = low + 4 * 86400000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (referenceDate(middle, timeZone) < date) low = middle + 1;
    else high = middle;
  }
  return low;
}
export const referenceRangeTokens = (steps: readonly Step[], start: number, end: number) =>
  referenceTokens(steps.filter((step) => step.start >= start && step.start < end));

export function referenceHours(start: number, end: number, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    timeZoneName: "longOffset",
    hourCycle: "h23",
  });
  const boundaries = [start];
  let before = formatter.format(start);
  for (let instant = start + 60000; instant < end; instant += 60000) {
    const label = formatter.format(instant);
    if (label !== before) boundaries.push(instant);
    before = label;
  }
  return boundaries.map((instant, index) => ({
    start: instant,
    end: boundaries[index + 1] ?? end,
  }));
}
