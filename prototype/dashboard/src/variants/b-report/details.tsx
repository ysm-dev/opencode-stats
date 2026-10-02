// PROTOTYPE B: inline breakdowns, rhythm, reliability and the session list.
import { createMemo, createSignal, For, Show } from "solid-js";
import { Punchcard } from "../../charts/punchcard";
import { RankedBars, type RankedItem } from "../../charts/ranked-bars";
import { breakdown, type Dimension, type ToolRow, type Totals } from "../../data/query";
import { punchcard } from "../../data/series";
import { compact, dateTime, duration, hour, int, pct, usd } from "../../format";
import { dash } from "../../state";

export function Breakdowns(props: { tools: ToolRow[] }) {
  return (
    <section id="b-breakdown" class="b-section">
      <header class="b-section-header">
        <h2>
          <span>04</span> Where it went
        </h2>
        <span class="b-caption">Click a row to toggle a filter</span>
      </header>
      <div class="b-breakdown-grid">
        <TokenBreakdown dim="model" title="Models" color="var(--chart-1)" />
        <TokenBreakdown dim="project" title="Projects" color="var(--chart-3)" />
        <TokenBreakdown dim="agent" title="Agents" color="var(--chart-4)" />
        <RankBlock
          title="Tools"
          note="Tool calls · tool calls only"
          dim="tool"
          items={props.tools.map((r) => ({
            key: r.key,
            label: r.key,
            value: r.calls,
            color: "var(--chart-2)",
            selected: dash.filters().tool?.includes(r.key),
          }))}
          format={int}
        />
      </div>
    </section>
  );
}

function TokenBreakdown(props: {
  dim: "model" | "project" | "agent";
  title: string;
  color: string;
}) {
  const rows = createMemo(() =>
    breakdown(dash.db(), dash.filters(), dash.range(), props.dim, dash.firsts()),
  );
  return (
    <RankBlock
      title={props.title}
      note="Tokens"
      dim={props.dim}
      items={rows().map((r) => ({
        key: r.key,
        label: r.label,
        sub: r.sub,
        value: r.tokens,
        color: props.color,
        selected: dash.filters()[props.dim]?.includes(r.key),
      }))}
      format={compact}
    />
  );
}

function RankBlock(props: {
  title: string;
  note: string;
  dim: Dimension;
  items: RankedItem[];
  format: (n: number) => string;
}) {
  const [all, setAll] = createSignal(false);
  return (
    <div class="b-rank-block">
      <div class="b-rank-heading">
        <h3>
          {props.title} <span class="faint num">{props.items.length}</span>
        </h3>
        <button
          type="button"
          class="b-inline-button"
          onClick={() => setAll((v) => !v)}
          aria-expanded={all()}
        >
          {all() ? "Show less" : "Show all"}
        </button>
      </div>
      <p class="b-caption b-rank-note">{props.note}</p>
      <RankedBars
        items={props.items}
        format={props.format}
        onSelect={(key) => dash.toggleFilter(props.dim, key)}
        limit={all() ? props.items.length : 5}
      />
      <Show when={!props.items.length}>
        <p class="b-caption">No matching activity in this range.</p>
      </Show>
    </div>
  );
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const biggest = (values: number[]) => values.indexOf(Math.max(...values));

export function Rhythm() {
  const grid = createMemo(() => punchcard(dash.db(), dash.filters(), dash.range(), "steps"));
  const days = createMemo(() => grid().map((row) => row.reduce((s, n) => s + n, 0)));
  const hours = createMemo(() =>
    Array.from({ length: 24 }, (_, h) => grid().reduce((s, row) => s + row[h]!, 0)),
  );
  const busyHour = () => hour(new Date(2026, 0, 5, biggest(hours())).getTime());
  return (
    <section id="b-rhythm" class="b-section">
      <header class="b-section-header">
        <h2>
          <span>05</span> Rhythm
        </h2>
        <span class="b-caption">Steps by weekday × hour · browser timezone</span>
      </header>
      <div class="b-rhythm-layout">
        <Punchcard grid={grid()} format={(v) => `${int(v)} steps`} />
        <div class="b-rhythm-copy">
          <Show
            when={days().some((n) => n > 0)}
            fallback={<p class="faint">No active hours in this range.</p>}
          >
            <div class="b-small-label">Busiest weekday</div>
            <div class="b-rhythm-value">{WEEKDAYS[biggest(days())]}</div>
            <p class="b-caption num">{int(days()[biggest(days())]!)} steps</p>
            <div class="b-small-label b-hour-label">Busiest hour</div>
            <div class="b-rhythm-value num">{busyHour()}</div>
            <p class="b-caption num">{int(hours()[biggest(hours())]!)} steps, across the range</p>
          </Show>
        </div>
      </div>
    </section>
  );
}

export function Reliability(props: { totals: Totals; tools: ToolRow[] }) {
  return (
    <section id="b-reliability" class="b-section">
      <header class="b-section-header">
        <h2>
          <span>06</span> Reliability & speed
        </h2>
        <span class="b-caption">Timing recorded from Aug 24, 2026</span>
      </header>
      <div class="b-reliability-grid">
        <div>
          <h3>Response time</h3>
          <p class="b-timing num">
            <span class="faint">p50</span> {duration(props.totals.respMedian)}{" "}
            <span class="faint">/ p95</span> {duration(props.totals.respP95)}
          </p>
          <p class="b-caption">
            {int(props.totals.respBasis)} of {int(props.totals.steps)} steps timed ·{" "}
            {pct(props.totals.respBasis / (props.totals.steps || 1), 0)}
          </p>
          <div class="b-failure-summary">
            <span>
              <strong class="num">{int(props.totals.failed)}</strong> failed steps ·{" "}
              <span class="num">{pct(props.totals.failureRate, 2)}</span>
            </span>
            <span>
              <strong class="num">{int(props.totals.interrupted)}</strong> interrupted steps
            </span>
          </div>
          <div class="b-errors">
            <For each={props.totals.errors}>
              {([error, count]) => (
                <div>
                  <span>{error}</span>
                  <span class="num">{int(count)}</span>
                </div>
              )}
            </For>
            <Show when={!props.totals.errors.length}>
              <p class="b-caption">No failed steps.</p>
            </Show>
          </div>
          <h3 class="b-outcome-title">
            Tool-call outcomes <span class="b-caption">· tool calls only</span>
          </h3>
          <Outcomes totals={props.totals} />
        </div>
        <div class="b-tool-runtime">
          <h3>Top tools · run time</h3>
          <p class="b-caption">Ranked by tool calls · tool calls only</p>
          <div class="b-runtime-row b-runtime-labels">
            <span>Tool</span>
            <span>p50 / p95</span>
            <span>Basis: calls timed</span>
          </div>
          <For each={props.tools.slice(0, 5)}>
            {(r) => (
              <div class="b-runtime-row">
                <span class="mono">{r.key}</span>
                <span class="num">
                  {duration(r.runMedian)} / {duration(r.runP95)}
                </span>
                <span class="num faint">
                  {int(r.runBasis)}/{int(r.calls)} · {pct(r.runBasis / r.calls, 0)}
                </span>
              </div>
            )}
          </For>
          <Show when={!props.tools.length}>
            <p class="b-caption">No matching tool calls.</p>
          </Show>
        </div>
      </div>
    </section>
  );
}

function Outcomes(props: { totals: Totals }) {
  const rows = () => [
    { label: "Succeeded", value: props.totals.succeeded, color: "var(--outcome-succeeded)" },
    { label: "Failed", value: props.totals.toolFailed, color: "var(--outcome-failed)" },
    { label: "Stopped", value: props.totals.stopped, color: "var(--outcome-stopped)" },
  ];
  return (
    <>
      <div class="b-outcome-bar">
        <For each={rows()}>
          {(r) => (
            <span
              style={{
                width: `${(r.value / (props.totals.toolCalls || 1)) * 100}%`,
                background: r.color,
              }}
            />
          )}
        </For>
      </div>
      <div class="b-outcome-legend">
        <For each={rows()}>
          {(r) => (
            <span>
              <i class="swatch" style={{ background: r.color }} />
              {r.label} <span class="num">{int(r.value)}</span>
            </span>
          )}
        </For>
      </div>
    </>
  );
}

const started = (key: string, fallback: number) =>
  dash.firsts().sessions.get(Number(key)) ?? fallback;

export function Sessions() {
  const rows = createMemo(() =>
    breakdown(dash.db(), dash.filters(), dash.range(), "session", dash.firsts()),
  );
  const [limit, setLimit] = createSignal(10);
  return (
    <section id="b-sessions" class="b-section">
      <header class="b-section-header">
        <h2>
          <span>07</span> Sessions
        </h2>
        <span class="b-caption">Top by tokens · click to filter</span>
      </header>
      <div class="b-session-row b-session-labels">
        <span>Session / project</span>
        <span>Started</span>
        <span>Steps</span>
        <span>Tokens</span>
        <span>≈ Cost</span>
      </div>
      <For each={rows().slice(0, limit())}>
        {(r) => (
          <button
            type="button"
            class="b-session-row"
            classList={{ "b-session-selected": dash.filters().session?.includes(r.key) }}
            onClick={() => dash.setFilter("session", [r.key])}
          >
            <span class="b-session-title">
              <span>{r.label}</span>
              <span class="b-caption">{r.sub}</span>
            </span>
            <span class="num muted">{dateTime(started(r.key, r.first))}</span>
            <span class="num">{int(r.steps)}</span>
            <span class="num">{compact(r.tokens)}</span>
            <span class="num">≈ {usd(r.est)}</span>
          </button>
        )}
      </For>
      <Show when={!rows().length}>
        <p class="b-caption">No sessions with steps in this range.</p>
      </Show>
      <div class="b-session-foot">
        <span class="b-caption">
          Showing {Math.min(limit(), rows().length)} of {int(rows().length)} sessions with steps in
          range. Estimated costs.
        </span>
        <Show when={rows().length > limit()}>
          <button type="button" class="b-inline-button" onClick={() => setLimit((n) => n + 10)}>
            Show more ↓
          </button>
        </Show>
      </div>
    </section>
  );
}
