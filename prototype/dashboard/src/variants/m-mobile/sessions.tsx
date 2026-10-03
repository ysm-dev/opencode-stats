// PROTOTYPE: variant E's sessions by day. Narrow, each session is one fixed-height two-line row
// (title and tokens; time, project, models and ≈ cost), so the list can still draw only the rows
// on screen. Subagent sessions indent 12px a level, at most three levels.
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { modelLabel } from "../../data/catalog";
import type { Step } from "../../data/db";
import { breakdown, type Row, stepsIn, tokensOf, totals } from "../../data/query";
import { addDays, dayKey, parseDay } from "../../data/time";
import { compact, day, int, time, usd } from "../../format";
import { dash } from "../../state";

type Activity = Pick<
  Row,
  "key" | "label" | "sub" | "first" | "models" | "steps" | "tokens" | "est"
>;

function subagentActivity(steps: Step[]): Map<number, Activity> {
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
        models: [...new Set(own.map((s) => s.model))],
        steps: own.length,
        tokens: own.reduce((n, s) => n + tokensOf(s), 0),
        est: own.reduce((n, s) => n + (s.est ?? 0), 0),
      },
    ]),
  );
}

export function SessionDays() {
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
  return (
    <section class="oc-surface d-journal m-journal">
      <div class="d-section-heading">
        <h2>Sessions by day</h2>
        <span class="faint">Newest first · tap a session to filter</span>
      </div>
      <Show
        when={days().length}
        fallback={
          <div class="d-empty">
            <h3>A quiet range.</h3>
            <p class="faint">No sessions match these local days and filters.</p>
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
            <Subagents
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

function Subagents(props: {
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
          <Subagents
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
      classList={{
        "d-subagent": !!props.depth,
        "m-session-on": !!dash.filters().session?.includes(props.session),
      }}
      style={{
        "--indent": `${Math.min(props.depth ?? 0, 4) * 20}px`,
        "--indent-narrow": `${Math.min(props.depth ?? 0, 3) * 12}px`,
      }}
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
        <span class="faint num m-session-steps">{int(props.row.steps)} steps</span>
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
