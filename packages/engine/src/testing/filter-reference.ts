import type {
  Step,
  StepDimensions,
  DimensionName,
  SessionFact,
} from "@opencode-stats/browser-copy";
import type { EngineState } from "../index.ts";
import { referenceTokens, referenceSessionPlacements } from "./reference.ts";
import type { Filter } from "../filters.ts";

type State = Extract<EngineState, { screen: "dashboard" }>;
type Row = Step & Partial<StepDimensions>;
type Selection = readonly Filter[];
const checklistDimensions = ["project", "provider", "model", "variant", "agent"] as const;
export function referenceFilters(
  rows: readonly Row[],
  names: readonly DimensionName[],
  filters: Selection,
  period: State["period"],
  sessions: readonly SessionFact[],
) {
  const matches = (row: Row, ignore = "") => {
    const dimensions = new Set(filters.map((filter) => filter.dimension));
    return [...dimensions].every(
      (dimension) =>
        dimension === "tool" ||
        dimension === ignore ||
        filters.some(
          (filter) =>
            filter.dimension === dimension &&
            names.some(
              (name) =>
                name.dimension === dimension &&
                name.id === filter.id &&
                name.code === row[dimension],
            ),
        ),
    );
  };
  const inRange = (start: number) => start >= period.start && start < period.end;
  const matching = rows.filter((row) => matches(row));
  const placed = referenceSessionPlacements(matching, sessions)
    .filter((placement) => inRange(placement.start))
    .map((placement) => placement.session);
  return {
    tokens: referenceTokens(matching.filter((row) => inRange(row.start))),
    sessions: {
      total: placed.filter((session) => session.code === session.session).length,
      subagents: placed.filter((session) => session.code !== session.session).length,
    },
    amounts: checklistDimensions.flatMap((dimension) =>
      names
        .filter((name) => name.dimension === dimension)
        .map((name) => ({
          dimension,
          id: name.id,
          tokens: referenceTokens(
            rows.filter(
              (row) =>
                inRange(row.start) && matches(row, dimension) && row[dimension] === name.code,
            ),
          ).total,
        })),
    ),
  };
}
