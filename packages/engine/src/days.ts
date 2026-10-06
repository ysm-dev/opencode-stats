import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import { stepDimensions } from "@opencode-stats/browser-copy";
import { localDate, midnight, addDates } from "./calendar.ts";
import { emptyAmounts, adjust, addAmounts, totals, type Fact, type Amounts } from "./amounts.ts";
import type { Period } from "./ranges.ts";
import { matchesFilters, type CompiledFilters, type FilterDimension } from "./filters.ts";

type Day = {
  start: number;
  end: number;
  facts: HashMap.HashMap<string, Fact>;
  groups: HashMap.HashMap<string, { amounts: Amounts; count: number; dimensions: Fact }>;
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
    groups: HashMap.empty<string, { amounts: Amounts; count: number; dimensions: Fact }>(),
  };
  const combination = stepDimensions.map((dimension) => fact[dimension]).join("\0");
  const group = Option.getOrUndefined(HashMap.get(day.groups, combination)) ?? {
    amounts: emptyAmounts(),
    count: 0,
  };
  const amounts = { ...group.amounts };
  adjust(amounts, fact, direction);
  const count = group.count + Number(direction);
  const groups =
    count === 0
      ? HashMap.remove(day.groups, combination)
      : HashMap.set(day.groups, combination, { amounts, count, dimensions: fact });
  const facts = direction === 1n ? HashMap.set(day.facts, id, fact) : HashMap.remove(day.facts, id);
  return HashMap.size(facts) === 0
    ? HashMap.remove(days, date)
    : HashMap.set(days, date, { start: day.start, end: day.end, groups, facts });
}

function* rangeAmounts(days: ReturnType<typeof emptyDays>, period: Period) {
  for (const day of HashMap.values(days)) {
    const { start, end } = day;
    if (start >= period.end || end <= period.start) continue;
    if (start >= period.start && end <= period.end) {
      for (const group of HashMap.values(day.groups)) yield group;
    } else {
      for (const fact of HashMap.values(day.facts)) {
        if (fact.start >= period.start && fact.start < period.end) {
          const amounts = emptyAmounts();
          adjust(amounts, fact, 1n);
          yield { dimensions: fact, amounts };
        }
      }
    }
  }
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

export function checklistAmounts(
  days: ReturnType<typeof emptyDays>,
  period: Period,
  filters: CompiledFilters,
  dimension: FilterDimension,
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
