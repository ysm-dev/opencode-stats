import * as Schema from "effect/Schema";
import { addDates, dateCount } from "./calendar.ts";
import { Cost } from "./cost.ts";
import { nearestRank } from "./statistics.ts";
import type { activityDays } from "./days.ts";

export const GraphMetric = Schema.Literals(["tokens", "steps", "cost"]);
export type GraphMetric = typeof GraphMetric.Type;
export const ContributionGraph = Schema.Struct({
  metric: GraphMetric,
  days: Schema.Array(
    Schema.Struct({
      date: Schema.String,
      tokens: Schema.Number,
      steps: Schema.Number,
      cost: Cost,
      level: Schema.Number,
    }),
  ),
  currentStreak: Schema.Number,
  longestStreak: Schema.Number,
});
export type ContributionGraph = typeof ContributionGraph.Type;
export const parseGraphMetric = (address: string, baseUrl: string): GraphMetric => {
  const values = new URL(address, baseUrl).searchParams.getAll("graph");
  if (values.length > 1) throw new Error("Duplicate contribution metric");
  return values.length === 0 ? "tokens" : Schema.decodeUnknownSync(GraphMetric)(values[0]);
};
export const graphAddress = (address: string, metric: GraphMetric) =>
  metric === "tokens" ? address : `${address}&graph=${metric}`;
type Activity = ReturnType<typeof activityDays>;
function streaks(activity: Activity, today: string) {
  const dates = [...activity.keys()].toSorted();
  let longestStreak = 0;
  let run = 0;
  let previous = "";
  for (const date of dates) {
    run = addDates(date, -1) === previous ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    previous = date;
  }
  let end = activity.has(today) ? today : addDates(today, -1);
  let currentStreak = 0;
  while (activity.has(end)) {
    currentStreak++;
    end = addDates(end, -1);
  }
  return { currentStreak, longestStreak };
}
export function contributionGraph(
  activity: Activity,
  today: string,
  metric: GraphMetric,
): ContributionGraph {
  const from = addDates(today, -364);
  const days = Array.from({ length: dateCount(from, today) }, (_, index) => {
    const date = addDates(from, index);
    const value = activity.get(date) ?? {
      tokens: 0,
      steps: 0,
      cost: { estimated: null, recorded: 0, pricedShare: null },
    };
    return { date, ...value };
  });
  return { metric, days: colourDays(days, metric), ...streaks(activity, today) };
}

type RawDay = Omit<ContributionGraph["days"][number], "level">;
function colourDays(days: readonly RawDay[], metric: GraphMetric) {
  const amount = (day: RawDay) => (metric === "cost" ? day.cost.estimated : day[metric]);
  // Activity is defined by steps, not nonzero usage. Free and zero-token days
  // belong in the quartiles; unpriced estimates cannot be ranked as zero.
  const sorted = days
    .filter((day) => day.steps > 0)
    .map(amount)
    .filter((value): value is number => value !== null)
    .toSorted((a, b) => a - b);
  const thresholds = [0.25, 0.5, 0.75].map((rank) => nearestRank(sorted, rank) ?? 0);
  return days.map((day) => {
    const value = amount(day);
    return {
      ...day,
      level:
        day.steps === 0
          ? 0
          : value === null
            ? -1
            : 1 + thresholds.filter((threshold) => value > threshold).length,
    };
  });
}
export const withGraphMetric = (
  graph: ContributionGraph,
  metric: GraphMetric,
): ContributionGraph => ({ ...graph, metric, days: colourDays(graph.days, metric) });
