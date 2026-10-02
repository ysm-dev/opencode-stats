import { SegmentedControl, SegmentedControlItem } from "@opencode/ui/segmented-control";
import { createMemo, createSignal, For } from "solid-js";
import { LevelLegend } from "../../charts/contribution-graph";
import { contribution, type ContributionMetric, streaks } from "../../data/series";
import { addDays, dayKey, daysBetween, startOfMonth, startOfWeek } from "../../data/time";
import { compact, day, int, month, usd } from "../../format";
import { contributionMetric, dash, setContributionMetric } from "../../state";
import { useTotals } from "./headlines";

const fmt = (v: number) =>
  contributionMetric() === "cost" ? `≈ ${usd(v)}` : `${compact(v)} ${contributionMetric()}`;
const inside = (t: number) => t >= dash.range().start && t < dash.range().axisEnd;
const select = (t: number, unit: "month" | "week") =>
  dash.setRange({
    kind: "fixed",
    unit,
    start: dayKey(unit === "month" ? startOfMonth(t) : startOfWeek(t)),
  });

export function YearGraph() {
  const cells = createMemo(() =>
    contribution(dash.db(), dash.filters(), dash.now(), contributionMetric()),
  );
  const streak = createMemo(() => streaks(dash.db(), dash.filters(), dash.now()));
  const { now } = useTotals();
  const origin = () => startOfWeek(cells()[0]!.t);
  const columns = () => Math.ceil((daysBetween(origin(), cells().at(-1)!.t) + 1) / 7);
  const col = (t: number) => Math.floor(daysBetween(origin(), t) / 7);
  const weeks = createMemo(() =>
    Array.from({ length: columns() }, (_, i) => addDays(origin(), i * 7)),
  );
  const months = createMemo(() =>
    cells().filter((c, i) => i === 0 || new Date(c.t).getDate() === 1),
  );
  const [hover, setHover] = createSignal("");
  return (
    <>
      <div class="d-graph-heading">
        <div>
          <h2>Contribution graph</h2>
          <p class="faint">Past 365 local days · select a day, week or month</p>
        </div>
        <SegmentedControl
          value={contributionMetric()}
          onChange={(v) => v && setContributionMetric(v as ContributionMetric)}
          style={{ width: "auto" }}
        >
          <SegmentedControlItem value="tokens">Tokens</SegmentedControlItem>
          <SegmentedControlItem value="steps">Steps</SegmentedControlItem>
          <SegmentedControlItem value="cost">Cost</SegmentedControlItem>
        </SegmentedControl>
      </div>
      <div class="d-graph-layout">
        <div class="d-weekdays">
          <For each={["Mon", "", "Wed", "", "Fri", "", "Sun"]}>{(d) => <span>{d}</span>}</For>
        </div>
        <div class="d-graph" style={{ "--weeks": columns() }}>
          <div class="d-months">
            <For each={months()}>
              {(m) => (
                <button
                  type="button"
                  style={{
                    "grid-column": `${col(m.t) + 1} / span ${Math.min(3, columns() - col(m.t))}`,
                  }}
                  title={`Select ${month(m.t)}`}
                  aria-label={`Select ${month(m.t)}`}
                  onClick={() => select(m.t, "month")}
                >
                  {month(m.t, false)}
                </button>
              )}
            </For>
          </div>
          <div class="d-cells">
            <For each={cells()}>
              {(c) => (
                <button
                  type="button"
                  class="d-cell"
                  classList={{ "d-selected": inside(c.t) }}
                  style={{
                    "grid-column": col(c.t) + 1,
                    "grid-row": ((new Date(c.t).getDay() + 6) % 7) + 1,
                    background: `var(--level-${c.level})`,
                  }}
                  title={`${day(c.t, { weekday: true, year: true })} · ${fmt(c.value)}`}
                  aria-label={`Select ${day(c.t, { year: true })}`}
                  aria-pressed={inside(c.t)}
                  onMouseEnter={() => setHover(`${day(c.t, { weekday: true })} · ${fmt(c.value)}`)}
                  onMouseLeave={() => setHover("")}
                  onFocus={() => setHover(`${day(c.t, { weekday: true })} · ${fmt(c.value)}`)}
                  onBlur={() => setHover("")}
                  onClick={() => dash.setRange({ kind: "fixed", unit: "day", start: dayKey(c.t) })}
                />
              )}
            </For>
          </div>
          <div class="d-weeks">
            <For each={weeks()}>
              {(t, i) => (
                <button
                  type="button"
                  aria-label={`Select week of ${day(t, { year: true })}`}
                  title={`Week of ${day(t)}`}
                  onClick={() => select(t, "week")}
                >
                  {i() % 4 === 0
                    ? Math.floor(
                        daysBetween(new Date(new Date(t).getFullYear(), 0, 1).getTime(), t) / 7,
                      ) + 1
                    : "·"}
                </button>
              )}
            </For>
          </div>
        </div>
      </div>
      <div class="d-graph-footer">
        <span class="faint">
          {hover() || "Quartile levels · week row selects a week · outlined cells are your range"}
        </span>
        <LevelLegend />
      </div>
      <div class="d-streaks">
        <div>
          <strong class="num">{int(streak().current)}</strong>
          <span>day current streak</span>
        </div>
        <div>
          <strong class="num">{int(streak().longest)}</strong>
          <span>day longest streak</span>
        </div>
        <div>
          <strong class="num">{int(now().activeDays)}</strong>
          <span>active days in range</span>
        </div>
      </div>
    </>
  );
}
