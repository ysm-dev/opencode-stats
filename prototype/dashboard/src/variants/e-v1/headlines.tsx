import { createMemo, For, Show } from "solid-js";
import { totals } from "../../data/query";
import { streaks } from "../../data/series";
import {
  change,
  changeText,
  compact,
  day,
  duration,
  int,
  pct,
  previousLabel,
  rangeLabel,
  usd,
} from "../../format";
import { dash } from "../../state";
import { OutcomeBar } from "../a-pages/parts";

export function useTotals() {
  const now = createMemo(() => totals(dash.db(), dash.filters(), dash.range(), dash.firsts()));
  const prev = createMemo(() => {
    const span = dash.previous();
    return span ? totals(dash.db(), dash.filters(), span, dash.firsts()) : null;
  });
  return { now, prev };
}

function period() {
  const spec = dash.spec();
  if (spec.kind === "fixed") return "in this fixed range";
  if (spec.preset === "today") return "today";
  if (spec.preset === "all") return "over all time";
  return `in the ${rangeLabel(dash.range()).toLowerCase()}`;
}

export function Headlines() {
  const { now: t, prev: p } = useTotals();
  const streak = createMemo(() => streaks(dash.db(), dash.filters(), dash.now()));
  const numbers = createMemo(() => [
    {
      label: "Tokens",
      value: compact(t().tokens),
      delta: change(t().tokens, p()?.tokens),
      sub: `${pct(t().cacheRead / (t().tokens || 1), 0)} cache read`,
    },
    {
      label: "Cost · estimate",
      value: `≈ ${usd(t().est)}`,
      delta: change(t().est, p()?.est),
      sub: `${usd(t().rec)} recorded cost`,
      extra: `${pct(t().pricedShare, 0)} of tokens priced`,
    },
    {
      label: "Steps",
      value: int(t().steps),
      delta: change(t().steps, p()?.steps),
      sub: `${t().stepsPerPrompt?.toFixed(1) ?? "–"} per prompt`,
    },
    {
      label: "Sessions",
      value: int(t().sessions),
      delta: change(t().sessions, p()?.sessions),
      sub: `+ ${int(t().subagentSessions)} subagent sessions`,
    },
    {
      label: "Prompts",
      value: int(t().prompts),
      delta: change(t().prompts, p()?.prompts),
      sub: "From you",
    },
    {
      label: "Cache hit rate",
      value: pct(t().cacheHitRate),
      delta: change(t().cacheHitRate, p()?.cacheHitRate),
      sub: `Context size median ${compact(t().ctxMedian ?? 0)}`,
    },
    {
      label: "Response time · p50",
      value: duration(t().respMedian),
      delta: change(t().respMedian, p()?.respMedian),
      sub: `p95 ${duration(t().respP95)} · ${pct(t().respBasis / (t().steps || 1), 0)} of steps timed`,
      extra: "Recorded from Aug 24, 2026",
    },
    {
      label: "Tool calls",
      value: compact(t().toolCalls),
      delta: change(t().toolCalls, p()?.toolCalls),
      sub: (
        <OutcomeBar
          succeeded={t().succeeded}
          failed={t().toolFailed}
          stopped={t().stopped}
          width={130}
        />
      ),
      extra: `${int(t().succeeded)} succeeded · ${int(t().toolFailed)} failed · ${int(t().stopped)} stopped`,
    },
    {
      label: "Active days",
      value: int(t().activeDays),
      delta: change(t().activeDays, p()?.activeDays),
      sub: `${int(streak().current)} day current streak`,
    },
    {
      label: "Failed steps",
      value: int(t().failed),
      delta: change(t().failed, p()?.failed),
      sub: `${pct(t().failureRate, 2)} failure rate`,
      extra: `${int(t().interrupted)} interrupted`,
    },
  ]);
  return (
    <section class="e-headlines">
      <div class="e-summary">
        You ran <span class="num">{int(t().steps)}</span> steps across{" "}
        <span class="num">{int(t().sessions)}</span> sessions {period()}.
      </div>
      <div class="e-numbers">
        <For each={numbers()}>
          {(n) => (
            <div class="e-number">
              <div class="e-number-label">{n.label}</div>
              <div class="e-number-value num">{n.value}</div>
              <div class="e-number-sub">
                {n.sub}
                <Show when={n.extra}>
                  <div>{n.extra}</div>
                </Show>
              </div>
              <Show when={dash.previous()}>
                <div class="e-number-change num">{changeText(n.delta) || "No comparison"}</div>
              </Show>
            </div>
          )}
        </For>
      </div>
      <Show when={dash.previous()}>
        {(previous) => (
          <p class="e-comparison">
            Changes {previousLabel(dash.range())} · {day(previous().start)} –{" "}
            {day(previous().end - 1)}
          </p>
        )}
      </Show>
    </section>
  );
}
