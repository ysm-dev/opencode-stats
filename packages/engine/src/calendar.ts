import * as DateTime from "effect/DateTime";

const zoned = (instant: number, timeZone: string) =>
  DateTime.makeZonedUnsafe(instant, { timeZone });
export const localDate = (instant: number, timeZone: string) =>
  DateTime.formatIsoDate(zoned(instant, timeZone));
export const midnight = (date: string, timeZone: string) =>
  DateTime.toEpochMillis(DateTime.makeZonedUnsafe(date, { timeZone, adjustForTimeZone: true }));
export const addDates = (date: string, days: number) =>
  DateTime.formatIsoDate(DateTime.add(DateTime.makeUnsafe(date), { days }));
// Date ordinals in UTC, not the duration of local days in a timezone.
export const dateCount = (from: string, to: string) =>
  (DateTime.toEpochMillis(DateTime.makeUnsafe(to)) -
    DateTime.toEpochMillis(DateTime.makeUnsafe(from))) /
    86400000 +
  1;

type CalendarBucket = { start: number; end: number; label: string };

const offset = (value: DateTime.Zoned) =>
  DateTime.toDate(value).getTime() - DateTime.toEpochMillis(value);

function nextHour(cursor: DateTime.Zoned, timeZone: string) {
  const instant = DateTime.toEpochMillis(cursor);
  const parts = DateTime.toParts(cursor);
  const next = instant + (60 - parts.minute) * 60000 - parts.second * 1000 - parts.millisecond;
  const currentOffset = offset(cursor);
  if (offset(zoned(next, timeZone)) === currentOffset) return zoned(next, timeZone);
  // A transition can precede the next whole hour (Chatham changes at :45).
  // Locate it using Effect's actual offsets, without converting wall times.
  let low = instant + 1;
  let high = next;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (offset(zoned(middle, timeZone)) === currentOffset) low = middle + 1;
    else high = middle;
  }
  return zoned(low, timeZone);
}

const nextCalendarBoundary = (
  cursor: DateTime.Zoned,
  timeZone: string,
  unit: "day" | "week" | "month",
) => {
  // Advance the date, not the resolved wall time: a missing midnight might
  // resolve to 01:00, but tomorrow's midnight must be resolved independently.
  const date = DateTime.makeUnsafe(DateTime.formatIsoDate(cursor));
  const next = DateTime.add(
    date,
    unit === "day" ? { days: 1 } : unit === "week" ? { weeks: 1 } : { months: 1 },
  );
  return zoned(midnight(DateTime.formatIsoDate(next), timeZone), timeZone);
};

// Hours advance to the next local clock boundary, retaining both occurrences
// of a repeated hour. A fractional DST jump introduces a partial hour.
export function calendarBuckets(
  start: number,
  end: number,
  timeZone: string,
  unit: "hour" | "day" | "week" | "month",
): CalendarBucket[] {
  const buckets: CalendarBucket[] = [];
  if (end <= start) return buckets;
  // Walk this local day's clock boundaries instead of resolving an ambiguous
  // wall hour. This also finds the partial repeated hour after a 30-minute jump.
  let cursor = DateTime.startOf(zoned(start, timeZone), unit === "hour" ? "day" : unit, {
    weekStartsOn: 1,
  });
  while (DateTime.toEpochMillis(cursor) < end) {
    const instant = DateTime.toEpochMillis(cursor);
    const next =
      unit === "hour" ? nextHour(cursor, timeZone) : nextCalendarBoundary(cursor, timeZone, unit);
    if (DateTime.toEpochMillis(next) > start)
      buckets.push({
        start: instant,
        end: DateTime.toEpochMillis(next),
        label: unit === "hour" ? DateTime.formatIsoOffset(cursor) : DateTime.formatIsoDate(cursor),
      });
    cursor = next;
  }
  return buckets;
}
