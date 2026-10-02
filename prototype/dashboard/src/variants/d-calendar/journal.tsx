import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { modelLabel } from "../../data/catalog";
import type { Step } from "../../data/db";
import { breakdown, type Row, stepsIn, tokensOf, totals } from "../../data/query";
import { addDays, dayKey, parseDay } from "../../data/time";
import { compact, day, int, time, usd } from "../../format";
import { dash } from "../../state";

type Activity = Pick<
  Row,
  "key" | "label" | "sub" | "first" | "last" | "models" | "steps" | "tokens" | "est"
>;

function subagentActivity(steps: Step[]) {
  const groups = new Map<number, Step[]>();
  for (const s of steps) {
    if (!s.sub) continue;
    const group = groups.get(s.own) ?? [];
    group.push(s);
    groups.set(s.own, group);
  }
  return new Map(
    [...groups].map(([id, own]) => [
      id,
      {
        key: String(id),
        label: dash.db().sessions.get(id)!.title,
        sub: dash.db().sessions.get(id)!.agent,
        first: own[0]!.at,
        last: own.at(-1)!.at,
        models: [...new Set(own.map((s) => s.model))],
        steps: own.length,
        tokens: own.reduce((n, s) => n + tokensOf(s), 0),
        est: own.reduce((n, s) => n + (s.est ?? 0), 0),
      },
    ]),
  );
}

export function Journal() {
  const [limit, setLimit] = createSignal(14);
  createEffect(() => {
    dash.range();
    dash.filters();
    setLimit(14);
  });
  const steps = createMemo(() => stepsIn(dash.db(), dash.filters(), dash.range()));
  const days = createMemo(() =>
    [...new Set(steps().map((s) => dayKey(s.at)))].toSorted().toReversed(),
  );
  const largest = createMemo(() =>
    Math.max(
      1,
      ...breakdown(dash.db(), dash.filters(), dash.range(), "session", dash.firsts()).map(
        (r) => r.tokens,
      ),
    ),
  );
  const dayRows = createMemo(() =>
    dash.range().days === 1
      ? breakdown(dash.db(), dash.filters(), dash.range(), "session", dash.firsts())
      : [],
  );
  return (
    <section class="oc-surface d-journal">
      <div class="d-section-heading">
        <h2>Session journal</h2>
        <span class="faint">Newest first · click a session to filter</span>
      </div>
      <Show when={dash.range().days === 1}>
        <HourStrip rows={dayRows()} />
      </Show>
      <Show
        when={days().length}
        fallback={
          <div class="d-empty">
            <h3>A quiet range.</h3>
            <p class="faint">No sessions match these local days and filters.</p>
            <button type="button" class="d-text-button" onClick={() => dash.clearFilters()}>
              Clear filters
            </button>
          </div>
        }
      >
        <For each={days().slice(0, limit())}>
          {(key) => <DayGroup date={key} max={largest()} />}
        </For>
        <Show when={days().length > limit()}>
          <button type="button" class="d-earlier" onClick={() => setLimit((n) => n + 14)}>
            Show earlier days{" "}
            <span class="faint">· {days().length - limit()} more active days</span>
          </button>
        </Show>
      </Show>
      <footer class="d-journal-note faint">
        Session numbers include subagent sessions. Nested rows are detail, not additional totals.
      </footer>
    </section>
  );
}

function DayGroup(props: { date: string; max: number }) {
  const span = () => ({
    start: Math.max(parseDay(props.date), dash.range().start),
    end: Math.min(addDays(parseDay(props.date), 1), dash.range().end),
  });
  const rows = createMemo(() =>
    breakdown(dash.db(), dash.filters(), span(), "session", dash.firsts()).toSorted(
      (a, b) => b.first - a.first,
    ),
  );
  const t = createMemo(() => totals(dash.db(), dash.filters(), span(), dash.firsts()));
  const children = createMemo(() => subagentActivity(stepsIn(dash.db(), dash.filters(), span())));
  return (
    <div class="d-day-group">
      <header class="d-day-heading">
        <button
          type="button"
          onClick={() => dash.setRange({ kind: "fixed", unit: "day", start: props.date })}
        >
          {day(parseDay(props.date), { weekday: true })}
        </button>
        <span class="num faint">
          {rows().length} sessions · {compact(t().tokens)} tokens · ≈ {usd(t().est)}
        </span>
      </header>
      <For each={rows()}>
        {(row) => (
          <>
            <SessionRow row={row} max={props.max} session={row.key} />
            <SubagentRows
              parent={Number(row.key)}
              session={row.key}
              activities={children()}
              max={props.max}
              depth={1}
            />
          </>
        )}
      </For>
    </div>
  );
}

function SubagentRows(props: {
  parent: number;
  session: string;
  activities: Map<number, Activity>;
  max: number;
  depth: number;
}) {
  const children = () =>
    [...props.activities]
      .filter(([id]) => dash.db().sessions.get(id)?.parent === props.parent)
      .toSorted((a, b) => b[1].first - a[1].first);
  return (
    <For each={children()}>
      {([id, row]) => (
        <>
          <SessionRow row={row} max={props.max} session={props.session} depth={props.depth} />
          <SubagentRows
            parent={id}
            session={props.session}
            activities={props.activities}
            max={props.max}
            depth={props.depth + 1}
          />
        </>
      )}
    </For>
  );
}

function SessionRow(props: { row: Activity; max: number; session: string; depth?: number }) {
  return (
    <button
      type="button"
      class="d-session"
      classList={{ "d-subagent": !!props.depth }}
      style={{ "--indent": `${Math.min(props.depth ?? 0, 4) * 20}px` }}
      onClick={() => dash.setFilter("session", [props.session])}
      title={`Filter to session: ${props.row.label}`}
    >
      <span class="d-session-time num">{time(props.row.first)}</span>
      <div class="d-session-main">
        <div class="d-session-title">
          {props.depth ? <span class="faint">↳ </span> : null}
          {props.row.label}
        </div>
        <div class="d-session-meta">
          <span class="d-project">{props.row.sub}</span>
          <Show when={props.depth}>
            <span class="d-model">Subagent session</span>
          </Show>
          <For each={props.row.models}>
            {(m) => (
              <span class="d-model" title={m}>
                {modelLabel(m)}
              </span>
            )}
          </For>
        </div>
      </div>
      <div class="d-session-numbers">
        <span class="faint num">{int(props.row.steps)} steps</span>
        <span class="num">
          {compact(props.row.tokens)} <span class="faint">tokens</span>
        </span>
        <span class="d-token-track">
          <span style={{ width: `${(props.row.tokens / props.max) * 100}%` }} />
        </span>
        <span class="num faint">≈ {usd(props.row.est)}</span>
      </div>
    </button>
  );
}

const rangeStart = () => dash.range().start;
const rangeDuration = () => dash.range().axisEnd - rangeStart();

function HourStrip(props: { rows: Row[] }) {
  return (
    <div class="d-hour-strip">
      <div class="d-hour-labels">
        <For each={[0, 6, 12, 18, 24]}>
          {(h) => <span class="num">{String(h).padStart(2, "0")}:00</span>}
        </For>
      </div>
      <div class="d-hour-track">
        <For each={props.rows}>
          {(row, i) => (
            <span
              style={{
                left: `${((row.first - rangeStart()) / rangeDuration()) * 100}%`,
                width: `${Math.max(0.5, ((row.last - row.first) / rangeDuration()) * 100)}%`,
                top: `${4 + (i() % 3) * 8}px`,
              }}
              title={`${row.label} · ${time(row.first)}–${time(row.last)}`}
            />
          )}
        </For>
      </div>
      <div class="faint text-[12px]">When sessions ran · local clock</div>
    </div>
  );
}
