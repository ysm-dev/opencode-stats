import { addDates, localDate, midnight } from "./calendar.ts";

export function startOfHistory(
  complete: boolean,
  completeFrom: number,
  first: number,
  now: number,
  timeZone: string,
) {
  if (complete) return first === Infinity ? midnight(localDate(now, timeZone), timeZone) : first;
  const date = localDate(completeFrom, timeZone);
  const start = midnight(date, timeZone);
  return start === completeFrom ? start : midnight(addDates(date, 1), timeZone);
}

export function* activeFacts<Fact extends { readonly start: number }>(
  facts: Iterable<Fact>,
  history: number,
): Iterable<Fact> {
  for (const fact of facts) if (fact.start >= history) yield fact;
}

export function historyLine(complete: boolean, date: string, line: string, paused: boolean) {
  if (complete || paused) return line;
  const state = line ? line[0]!.toLowerCase() + line.slice(1) : "older history is still being read";
  return `History from ${date} · ${state}`;
}
