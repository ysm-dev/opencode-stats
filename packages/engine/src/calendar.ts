import * as DateTime from "effect/DateTime";

export const zoned = (instant: number, timeZone: string) =>
  DateTime.makeZonedUnsafe(instant, { timeZone });
export const localDate = (instant: number, timeZone: string) =>
  DateTime.formatIsoDate(zoned(instant, timeZone));
export const midnight = (date: string, timeZone: string) =>
  DateTime.toEpochMillis(DateTime.makeZonedUnsafe(date, { timeZone, adjustForTimeZone: true }));
export const addDates = (date: string, days: number) =>
  DateTime.formatIsoDate(DateTime.add(DateTime.makeUnsafe(date), { days }));
export const dateCount = (from: string, to: string) =>
  (DateTime.toEpochMillis(DateTime.makeUnsafe(to)) -
    DateTime.toEpochMillis(DateTime.makeUnsafe(from))) /
    86400000 +
  1;

export type CalendarBucket = { start: number; end: number; label: string };

// Hours advance to the next local clock boundary, retaining both occurrences
// of a repeated hour. A fractional DST jump introduces a partial hour.
export function calendarBuckets(
  start: number,
  end: number,
  timeZone: string,
  unit: "hour" | "day" | "week" | "month",
): CalendarBucket[] {
  const buckets: CalendarBucket[] = [];
  let cursor = DateTime.startOf(zoned(start, timeZone), unit, { weekStartsOn: 1 });
  // startOf(hour) resolves to the earlier occurrence: retain the input offset.
  if (unit === "hour") {
    const parts = DateTime.toParts(zoned(start, timeZone));
    cursor = zoned(
      start - parts.minute * 60000 - parts.second * 1000 - parts.millisecond,
      timeZone,
    );
  }
  while (DateTime.toEpochMillis(cursor) < end) {
    const instant = DateTime.toEpochMillis(cursor);
    const next =
      unit === "hour"
        ? zoned(instant + (60 - DateTime.toParts(cursor).minute) * 60000, timeZone)
        : DateTime.add(
            cursor,
            unit === "day" ? { days: 1 } : unit === "week" ? { weeks: 1 } : { months: 1 },
          );
    buckets.push({
      start: instant,
      end: DateTime.toEpochMillis(next),
      label: unit === "hour" ? DateTime.formatIsoOffset(cursor) : DateTime.formatIsoDate(cursor),
    });
    cursor = next;
  }
  return buckets;
}
