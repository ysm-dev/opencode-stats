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
    expect(buckets.map(({ start, end }) => ({ start, end }))).toEqual(
      referenceHours(start, end, zone),
    );
    if (hours === 25) expect(new Set(buckets.map((bucket) => bucket.label)).size).toBe(25);
    if (zone === "America/New_York" && hours === 25) {
      expect(buckets[1]!.label).toContain("01:00:00.000-04:00");
      expect(buckets[2]!.label).toContain("01:00:00.000-05:00");
      expect(calendarBuckets(buckets[2]!.start + 12345, end, zone, "hour")[0]).toEqual(buckets[2]);
    }
  },
);

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
        expect(
          calendarBuckets(start, end, zone, "hour").map(({ start, end }) => ({ start, end })),
        ).toEqual(referenceHours(start, end, zone));
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
