import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import { stepDimensions } from "@opencode-stats/browser-copy";
import { localDate, midnight, addDates } from "./calendar.ts";
import { emptyAmounts, adjust, addAmounts, totals, type Fact, type Amounts } from "./amounts.ts";
import type { Period } from "./ranges.ts";
import { matchesFilters, type CompiledFilters, type FilterDimension } from "./filters.ts";
import { emptyCost, addCost, costTotals, combineCost } from "./cost.ts";

type Group = {
  amounts: Amounts;
  count: number;
  dimensions: Fact;
  cost: ReturnType<typeof emptyCost>;
};

type Day = {
  start: number;
  end: number;
  facts: HashMap.HashMap<string, Fact>;
  groups: HashMap.HashMap<string, Group>;
};
export const emptyDays = () => HashMap.empty<string, Day>();

export function updateDay(
  days: ReturnType<typeof emptyDays>,
  id: string,
  fact: Fact,
  timeZone: string,
  direction: bigint,
) {
  const date = localDate(fact.start, timeZone);
  const day = Option.getOrUndefined(HashMap.get(days, date)) ?? {
    start: midnight(date, timeZone),
    end: midnight(addDates(date, 1), timeZone),
    facts: HashMap.empty<string, Fact>(),
    groups: HashMap.empty<string, Group>(),
  };
  const combination = stepDimensions.map((dimension) => fact[dimension]).join("\0");
  const group = Option.getOrUndefined(HashMap.get(day.groups, combination)) ?? {
    amounts: emptyAmounts(),
    cost: emptyCost(),
    count: 0,
  };
  const amounts = { ...group.amounts };
  adjust(amounts, fact, direction);
  const cost = { ...group.cost };
  addCost(cost, fact, Number(direction));
  const count = group.count + Number(direction);
  const groups =
    count === 0
      ? HashMap.remove(day.groups, combination)
      : HashMap.set(day.groups, combination, { amounts, cost, count, dimensions: fact });
  const facts = direction === 1n ? HashMap.set(day.facts, id, fact) : HashMap.remove(day.facts, id);
  return HashMap.size(facts) === 0
    ? HashMap.remove(days, date)
    : HashMap.set(days, date, { start: day.start, end: day.end, groups, facts });
}

function* rangeAmounts(days: ReturnType<typeof emptyDays>, period: Period) {
  for (const [date, day] of days) {
    const { start, end } = day;
    if (start >= period.end || end <= period.start) continue;
    if (start >= period.start && end <= period.end) {
      for (const group of HashMap.values(day.groups)) yield { ...group, date };
    } else {
      for (const fact of HashMap.values(day.facts)) {
        if (fact.start >= period.start && fact.start < period.end) {
          const amounts = emptyAmounts();
          adjust(amounts, fact, 1n);
          const cost = emptyCost();
          addCost(cost, fact);
          yield { date, dimensions: fact, amounts, cost, count: 1 };
        }
      }
    }
  }
}

export function activityDays(
  days: ReturnType<typeof emptyDays>,
  period: Period,
  filters: CompiledFilters,
) {
  const values = new Map<
    string,
    { amounts: Amounts; steps: number; cost: ReturnType<typeof emptyCost> }
  >();
  for (const group of rangeAmounts(days, period)) {
    if (!matchesFilters(group.dimensions, filters)) continue;
    const value = values.get(group.date) ?? {
      amounts: emptyAmounts(),
      steps: 0,
      cost: emptyCost(),
    };
    addAmounts(value.amounts, group.amounts);
    value.steps += group.count;
    combineCost(value.cost, group.cost);
    values.set(group.date, value);
  }
  return new Map(
    [...values].map(([date, value]) => [
      date,
      { tokens: totals(value.amounts).total, steps: value.steps, cost: costTotals(value.cost) },
    ]),
  );
}

export function dayTotals(
  days: ReturnType<typeof emptyDays>,
  period: Period,
  filters: CompiledFilters,
) {
  const amounts = emptyAmounts();
  for (const group of rangeAmounts(days, period)) {
    if (matchesFilters(group.dimensions, filters)) addAmounts(amounts, group.amounts);
  }
  return totals(amounts);
}

export function dayActiveCount(
  days: ReturnType<typeof emptyDays>,
  period: Period,
  filters: CompiledFilters,
) {
  const active = new Set<string>();
  for (const group of rangeAmounts(days, period)) {
    if (matchesFilters(group.dimensions, filters)) active.add(group.date);
  }
  return active.size;
}

export function checklistAmounts(
  days: ReturnType<typeof emptyDays>,
  period: Period,
  filters: CompiledFilters,
  dimension: Exclude<FilterDimension, "tool">,
) {
  const values = new Map<number, Amounts>();
  for (const group of rangeAmounts(days, period)) {
    if (!matchesFilters(group.dimensions, filters, dimension)) continue;
    const code = group.dimensions[dimension];
    const amounts = values.get(code) ?? emptyAmounts();
    addAmounts(amounts, group.amounts);
    values.set(code, amounts);
  }
  return new Map([...values].map(([code, amounts]) => [code, totals(amounts).total]));
}
