import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import { stepDimensions } from "@opencode-stats/browser-copy";
import { localDate, midnight, addDates } from "./calendar.ts";
import { emptyAmounts, adjust, addAmounts, totals, type Fact, type Amounts } from "./amounts.ts";
import type { Period } from "./ranges.ts";

type Day = {
  facts: HashMap.HashMap<string, Fact>;
  groups: HashMap.HashMap<string, { amounts: Amounts; count: number }>;
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
    facts: HashMap.empty<string, Fact>(),
    groups: HashMap.empty<string, { amounts: Amounts; count: number }>(),
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
      : HashMap.set(day.groups, combination, { amounts, count });
  const facts = direction === 1n ? HashMap.set(day.facts, id, fact) : HashMap.remove(day.facts, id);
  return HashMap.size(facts) === 0
    ? HashMap.remove(days, date)
    : HashMap.set(days, date, { groups, facts });
}

export function dayTotals(days: ReturnType<typeof emptyDays>, period: Period, timeZone: string) {
  const amounts = emptyAmounts();
  for (const [date, day] of days) {
    const start = midnight(date, timeZone);
    const end = midnight(addDates(date, 1), timeZone);
    if (start >= period.end || end <= period.start) continue;
    if (start >= period.start && end <= period.end) {
      for (const group of HashMap.values(day.groups)) addAmounts(amounts, group.amounts);
    } else {
      for (const fact of HashMap.values(day.facts)) {
        if (fact.start >= period.start && fact.start < period.end) adjust(amounts, fact, 1n);
      }
    }
  }
  return totals(amounts);
}
