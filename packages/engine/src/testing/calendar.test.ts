import { expect, it } from "vitest";
import * as fc from "fast-check";
import { propertyParameters } from "@opencode-stats/browser-copy/testing";
import { calendarBuckets } from "../index.ts";
import {
  referenceAdd,
  referenceDate,
  referenceHours,
  referenceMidnight,
} from "./time-reference.ts";

const interval = (bucket: { start: number; end: number }) => ({
  start: bucket.start,
  end: bucket.end,
});

it.each([
  ["America/New_York", "2026-03-08", 23],
  ["America/New_York", "2026-11-01", 25],
  ["Europe/London", "2026-03-29", 23],
  ["Europe/London", "2026-10-25", 25],
  ["Asia/Kathmandu", "2026-10-07", 24],
  ["Australia/Lord_Howe", "2026-04-05", 25],
  ["Australia/Lord_Howe", "2026-10-04", 24],
] as const)(
  "reckons %s %s by clock hours, including every repeated offset",
  (zone, date, hours) => {
    const start = referenceMidnight(date, zone);
    const end = referenceMidnight(referenceAdd(date, 1), zone);
    const buckets = calendarBuckets(start, end, zone, "hour");
    expect(buckets).toHaveLength(hours);
    expect(buckets.map(interval)).toEqual(referenceHours(start, end, zone));
    expect(new Set(buckets.map((bucket) => bucket.label)).size).toBe(hours);
  },
);

it.each([
  ["America/New_York", "2026-11-01", 1, "01:00:00.000-04:00", 12345],
  ["America/New_York", "2026-11-01", 2, "01:00:00.000-05:00", 12345],
  ["Australia/Lord_Howe", "2026-04-05", 2, "01:30:00.000+10:30", 900000],
] as const)("labels and retains %s %s hour occurrence %i", (zone, date, index, label, elapsed) => {
  const start = referenceMidnight(date, zone);
  const end = referenceMidnight(referenceAdd(date, 1), zone);
  const bucket = calendarBuckets(start, end, zone, "hour")[index]!;
  expect(bucket.label).toContain(label);
  expect(calendarBuckets(bucket.start + elapsed, end, zone, "hour")[0]).toEqual(bucket);
});

it("matches Intl's independent local-day and hourly reference across IANA zones and calendars", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...Intl.supportedValuesOf("timeZone")),
      fc.integer({ min: 0, max: 11000 }),
      (zone, days) => {
        const date = referenceDate(Date.UTC(2000, 0, 1) + days * 86400000, zone);
        const start = referenceMidnight(date, zone);
        const end = referenceMidnight(referenceAdd(date, 1), zone);
        expect(calendarBuckets(start, end, zone, "day")).toEqual([{ start, end, label: date }]);
        expect(calendarBuckets(start, end, zone, "hour").map(interval)).toEqual(
          referenceHours(start, end, zone),
        );
      },
    ),
    propertyParameters,
  );
});

it("starts weeks on Monday and advances weeks and months in the local calendar", () => {
  const zone = "Europe/London";
  const start = referenceMidnight("2026-03-29", zone);
  const end = referenceMidnight("2026-04-07", zone);
  const weeks = calendarBuckets(start, end, zone, "week");
  expect(weeks.map((bucket) => bucket.label)).toEqual(["2026-03-23", "2026-03-30", "2026-04-06"]);
  expect(weeks[0]).toEqual({
    start: referenceMidnight("2026-03-23", zone),
    end: referenceMidnight("2026-03-30", zone),
    label: "2026-03-23",
  });
  expect(calendarBuckets(start, end, zone, "month").map((bucket) => bucket.label)).toEqual([
    "2026-03-01",
    "2026-04-01",
  ]);
  expect(calendarBuckets(end, start, zone, "day")).toEqual([]);
});

it.each([
  ["2026-09-27", "02:00:00.000+12:45", "03:45:00.000+13:45", 24],
  ["2026-04-05", "03:00:00.000+13:45", "02:45:00.000+12:45", 26],
] as const)(
  "splits Chatham's %s fractional-wall transition at its exact instant",
  (date, before, after, count) => {
    const zone = "Pacific/Chatham";
    const start = referenceMidnight(date, zone);
    const end = referenceMidnight(referenceAdd(date, 1), zone);
    const buckets = calendarBuckets(start, end, zone, "hour");
    expect(buckets).toHaveLength(count);
    expect(buckets.map(interval)).toEqual(referenceHours(start, end, zone));
    const preceding = buckets.findIndex((bucket) => bucket.label.includes(before));
    expect(preceding).toBeGreaterThanOrEqual(0);
    expect(buckets[preceding + 1]!.label).toContain(after);
    expect(buckets[preceding]!.end).toBe(buckets[preceding + 1]!.start);
    expect(calendarBuckets(buckets[preceding + 1]!.start + 12345, end, zone, "hour")[0]).toEqual(
      buckets[preceding + 1],
    );
  },
);

it.each([
  ["America/Santiago", "day", ["2026-09-06", "2026-09-07", "2026-09-08", "2026-09-09"]],
  ["Asia/Tehran", "week", ["2021-03-22", "2021-03-29", "2021-04-05"]],
  ["America/Asuncion", "month", ["2017-10-01", "2017-11-01", "2017-12-01"]],
] as const)(
  "resolves each %s %s boundary independently after a missing midnight",
  (zone, unit, dates) => {
    const end = referenceMidnight(dates.at(-1)!, zone);
    const expected = dates.slice(0, -1).map((date, index) => ({
      label: date,
      start: referenceMidnight(date, zone),
      end: referenceMidnight(dates[index + 1]!, zone),
    }));
    const start = expected[0]!.start;
    expect(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: zone,
        hour: "2-digit",
        hourCycle: "h23",
      }).format(start),
    ).toBe("01");
    expect(calendarBuckets(start, end, zone, unit)).toEqual(expected);
    expect(calendarBuckets(expected[1]!.start, end, zone, unit)).toEqual(expected.slice(1));
  },
);
