import * as Schema from "effect/Schema";
import { addDates, calendarBuckets, localDate, midnight } from "./calendar.ts";
import { clockLabel, dateLabel } from "./time-labels.ts";
import type { Period } from "./ranges.ts";

export const BucketUnit = Schema.Literals(["hour", "day", "week", "month"]);
export const ChartBucket = Schema.Struct({
  axisStart: Schema.Number,
  axisEnd: Schema.Number,
  start: Schema.Number,
  end: Schema.Number,
  from: Schema.String,
  to: Schema.String,
  title: Schema.String,
  partial: Schema.Boolean,
});
const bucketUnit = (days: number): typeof BucketUnit.Type =>
  days === 1 ? "hour" : days <= 90 ? "day" : days <= 365 ? "week" : "month";
const labels = new Map<string, string>();
const labelFor = (date: string, locale: string) => {
  const key = `${locale}\0${date}`;
  const cached = labels.get(key);
  if (cached !== undefined) return cached;
  const label = dateLabel(date, locale);
  labels.set(key, label);
  return label;
};

export function chartBuckets(period: Period, timeZone: string, locale: string, dataStart: number) {
  const unit = bucketUnit(period.days);
  const axisEnd = midnight(addDates(period.to, 1), timeZone);
  const weekdays = new Intl.DateTimeFormat("en", { timeZone, weekday: "short" });
  const buckets = calendarBuckets(period.start, axisEnd, timeZone, unit).map((bucket) => {
    const from = bucket.label.slice(0, 10);
    const to = unit === "hour" ? from : addDates(localDate(bucket.end, timeZone), -1);
    const start = Math.min(bucket.end, Math.max(bucket.start, dataStart));
    const end = Math.max(start, Math.min(bucket.end, period.end));
    const partial =
      start !== bucket.start ||
      end !== bucket.end ||
      (unit === "hour" && bucket.end - bucket.start !== 3600000);
    const date = labelFor(from, locale);
    const title =
      unit === "hour"
        ? `${date} · ${clockLabel(bucket.start, timeZone, locale)} · UTC${bucket.label.slice(-6)}`
        : unit === "day"
          ? `${weekdays.format(bucket.start)}, ${date}`
          : `${date} – ${labelFor(to, locale)}`;
    return {
      axisStart: bucket.start,
      axisEnd: bucket.end,
      start,
      end,
      from,
      to,
      title: title + (partial ? " · partial" : ""),
      partial,
    };
  });
  return { unit, buckets };
}
