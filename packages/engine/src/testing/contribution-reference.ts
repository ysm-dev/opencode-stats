import { tokenKinds } from "@opencode-stats/browser-copy";
import type { syntheticCopy } from "@opencode-stats/browser-copy/testing";
import type { GraphMetric } from "../index.ts";
import { referenceAdd, referenceDate } from "./time-reference.ts";

export function referenceContributions(
  rows: Parameters<typeof syntheticCopy>[0],
  now: number,
  zone: string,
  history: number,
  metric: GraphMetric,
) {
  const today = referenceDate(now, zone);
  const first = referenceAdd(today, -364);
  const eligible = rows
    .filter((row) => row.start >= history && row.start < now)
    .map((row) => ({ row, date: referenceDate(row.start, zone) }));
  const activity = [...new Set(eligible.map((value) => value.date))].toSorted();
  const days = Array.from({ length: 365 }, (_, index) => {
    const date = referenceAdd(first, index);
    const steps = eligible.filter((value) => value.date === date).map((value) => value.row);
    const priced = steps.filter(
      (row) => row.estimatedCost !== null && row.estimatedCost !== undefined,
    );
    const tokensOf = (values: typeof steps) =>
      values.reduce(
        (sum, row) => sum + tokenKinds.reduce((total, kind) => total + (row[kind] ?? 0), 0),
        0,
      );
    const tokens = tokensOf(steps);
    return {
      date,
      tokens,
      steps: steps.length,
      cost: {
        estimated:
          priced.length === 0 ? null : priced.reduce((sum, row) => sum + row.estimatedCost!, 0),
        recorded: steps.reduce((sum, row) => sum + (row.recordedCost ?? 0), 0),
        pricedShare: tokens === 0 ? null : tokensOf(priced) / tokens,
      },
    };
  });
  const metricValue = (day: (typeof days)[number]) =>
    metric === "cost" ? day.cost.estimated : day[metric];
  const sample = days
    .filter((day) => day.steps > 0 && metricValue(day) !== null)
    .map((day) => metricValue(day)!)
    .toSorted((a, b) => a - b);
  let longestStreak = 0;
  let consecutive = 0;
  for (const [index, date] of activity.entries()) {
    consecutive = activity[index - 1] === referenceAdd(date, -1) ? consecutive + 1 : 1;
    longestStreak = Math.max(longestStreak, consecutive);
  }
  let end = activity.includes(today) ? today : referenceAdd(today, -1);
  let currentStreak = 0;
  while (activity.includes(end)) {
    currentStreak++;
    end = referenceAdd(end, -1);
  }
  return {
    metric,
    currentStreak,
    longestStreak,
    days: days.map((day) => {
      const value = metricValue(day);
      const level =
        day.steps === 0
          ? 0
          : value === null
            ? -1
            : 1 +
              [0.25, 0.5, 0.75].filter((p) => value > sample[Math.ceil(p * sample.length) - 1]!)
                .length;
      return { ...day, level };
    }),
  };
}
