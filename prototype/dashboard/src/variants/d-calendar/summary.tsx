import { createMemo, For, Show } from "solid-js";
import { RankedBars } from "../../charts/ranked-bars";
import { TimeChart } from "../../charts/time-chart";
import { breakdown, percentile, toolsIn, totals, type Totals } from "../../data/query";
import { timeSeries } from "../../data/series";
import { change, changeText, compact, duration, int, pct, previousLabel, usd } from "../../format";
import { dash } from "../../state";

export function Summary() {
  const t = createMemo(() => totals(dash.db(), dash.filters(), dash.range(), dash.firsts()));
  const previous = createMemo(() => {
    const p = dash.previous();
    return p ? totals(dash.db(), dash.filters(), p, dash.firsts()) : null;
  });
  const series = createMemo(() =>
    timeSeries(dash.db(), dash.filters(), dash.buckets(), "tokens", "none", dash.firsts()),
  );
  const metrics: {
    key: "tokens" | "est" | "steps" | "sessions" | "prompts" | "cacheHitRate";
    label: string;
    format: (n: number | null) => string;
  }[] = [
    { key: "tokens", label: "Tokens", format: (n) => compact(n ?? 0) },
    { key: "est", label: "≈ Cost", format: (n) => `≈ ${usd(n ?? 0)}` },
    { key: "steps", label: "Steps", format: (n) => int(n ?? 0) },
    { key: "sessions", label: "Sessions", format: (n) => int(n ?? 0) },
    { key: "prompts", label: "Prompts", format: (n) => int(n ?? 0) },
    { key: "cacheHitRate", label: "Cache hit rate", format: pct },
  ];
  return (
    <aside class="d-summary">
      <section class="oc-surface d-summary-card">
        <div class="d-section-heading">
          <h2>Range summary</h2>
          <span class="faint">{int(t().activeDays)} active days</span>
        </div>
        <div class="d-headlines">
          <For each={metrics}>
            {(m) => (
              <div>
                <div class="d-metric-label">
                  {m.label}
                  <Show when={previous()}>
                    <span class="num" title={previousLabel(dash.range())}>
                      {changeText(change(t()[m.key], previous()?.[m.key]))}
                    </span>
                  </Show>
                </div>
                <strong class="num">{m.format(t()[m.key])}</strong>
                <Show when={m.key === "est"}>
                  <div class="d-metric-sub">
                    Recorded cost {usd(t().rec)} · {pct(t().pricedShare, 0)} priced
                  </div>
                </Show>
                <Show when={m.key === "sessions"}>
                  <div class="d-metric-sub">+ {int(t().subagentSessions)} subagent sessions</div>
                </Show>
              </div>
            )}
          </For>
        </div>
        <Show when={previous()}>
          <div class="d-comparison faint">Neutral changes {previousLabel(dash.range())}</div>
        </Show>
        <div class="d-mini-chart">
          <div class="d-mini-heading">
            Tokens by {dash.range().bucket}
            <span class="faint">click to drill</span>
          </div>
          <TimeChart
            series={series()}
            buckets={dash.buckets()}
            unit={dash.range().bucket}
            height={142}
            onSelect={(b) => dash.drill(b)}
          />
          <div class="faint text-[11px]">Faded buckets are partial.</div>
        </div>
      </section>
      <section class="oc-surface d-summary-card">
        <div class="d-section-heading">
          <h2>Where the tokens went</h2>
          <span class="faint">Share of tokens</span>
        </div>
        <For each={["model", "project", "agent"] as const}>{(dim) => <Shares dim={dim} />}</For>
      </section>
      <ToolSummary totals={t()} />
    </aside>
  );
}

function Shares(props: { dim: "model" | "project" | "agent" }) {
  const rows = createMemo(() =>
    breakdown(dash.db(), dash.filters(), dash.range(), props.dim, dash.firsts()),
  );
  return (
    <div class="d-shares">
      <h3>{props.dim === "model" ? "Models" : props.dim === "project" ? "Projects" : "Agents"}</h3>
      <RankedBars
        items={rows().map((r, i) => ({
          key: r.key,
          label: r.label,
          value: r.tokens,
          selected: dash.filters()[props.dim]?.includes(r.key),
          color: `var(--chart-${(i % 7) + 1})`,
        }))}
        format={compact}
        extra={(item) => pct(rows().find((r) => r.key === item.key)?.share ?? 0, 0)}
        onSelect={(key) => dash.toggleFilter(props.dim, key)}
        limit={4}
      />
    </div>
  );
}

function ToolSummary(props: { totals: Totals }) {
  const calls = createMemo(() => toolsIn(dash.db(), dash.filters(), dash.range()));
  const runs = createMemo(() =>
    calls()
      .flatMap((c) => (c.run === null ? [] : [c.run]))
      .toSorted((a, b) => a - b),
  );
  const outcomes = () => [
    { label: "Succeeded", value: props.totals.succeeded, color: "var(--outcome-succeeded)" },
    { label: "Failed", value: props.totals.toolFailed, color: "var(--outcome-failed)" },
    { label: "Stopped", value: props.totals.stopped, color: "var(--outcome-stopped)" },
  ];
  return (
    <section class="oc-surface d-summary-card d-timing">
      <div class="d-section-heading">
        <h2>Tool calls & timing</h2>
        <span class="num faint">{compact(props.totals.toolCalls)} calls</span>
      </div>
      <div class="d-outcomes">
        <For each={outcomes()}>
          {(o) => (
            <span
              style={{
                width: `${(o.value / (props.totals.toolCalls || 1)) * 100}%`,
                background: o.color,
              }}
            />
          )}
        </For>
      </div>
      <div class="d-outcome-labels">
        <For each={outcomes()}>
          {(o) => (
            <span>
              <i style={{ background: o.color }} />
              {o.label} <span class="num">{int(o.value)}</span>
            </span>
          )}
        </For>
      </div>
      <div class="d-timing-row">
        <span>Run time</span>
        <strong class="num">
          p50 {duration(percentile(runs(), 0.5))} · p95 {duration(percentile(runs(), 0.95))}
        </strong>
        <span class="faint">
          {pct(runs().length / (calls().length || 1), 0)} of tool calls timed · {int(runs().length)}{" "}
          calls
        </span>
      </div>
      <div class="d-timing-row">
        <span>Response time</span>
        <strong class="num">
          p50 {duration(props.totals.respMedian)} · p95 {duration(props.totals.respP95)}
        </strong>
        <span class="faint">
          {pct(props.totals.respBasis / (props.totals.steps || 1), 0)} of steps timed ·{" "}
          {int(props.totals.respBasis)} steps
        </span>
      </div>
      <p class="faint">Timing recorded from Aug 24, 2026. Tool filters narrow tool calls only.</p>
    </section>
  );
}
