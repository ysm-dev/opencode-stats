import { createMemo, createSignal, For, Show, type JSX } from "solid-js";
import { breakdown, type Row } from "../../data/query";
import { compact, dateTime, duration, int, pct, usd } from "../../format";
import { dash } from "../../state";
import { callsBy } from "../c-explorer/model";
import { useTotals } from "./headlines";

interface Column {
  id: string;
  title: string;
  left?: boolean;
  value: (r: Row) => string | number | null;
  render: (r: Row) => JSX.Element;
}

export function SessionTable() {
  const { now } = useTotals();
  const rows = createMemo(() =>
    breakdown(dash.db(), dash.filters(), dash.range(), "session", dash.firsts()),
  );
  const calls = createMemo(() => callsBy("session"));
  const count = (r: Row) => (r.key === "__total" ? now().toolCalls : (calls().get(r.key) ?? 0));
  const columns: Column[] = [
    {
      id: "label",
      title: "Session",
      left: true,
      value: (r) => r.label,
      render: (r) => <span class="c-table-name">{r.label}</span>,
    },
    {
      id: "project",
      title: "Project",
      left: true,
      value: (r) => r.sub ?? "",
      render: (r) => r.sub ?? "–",
    },
    {
      id: "first",
      title: "Started",
      value: (r) => dash.firsts().sessions.get(Number(r.key)) ?? r.first,
      render: (r) =>
        r.key === "__total" ? "–" : dateTime(dash.firsts().sessions.get(Number(r.key)) ?? r.first),
    },
    { id: "tokens", title: "Tokens", value: (r) => r.tokens, render: (r) => compact(r.tokens) },
    {
      id: "est",
      title: "≈Cost",
      value: (r) => r.est,
      render: (r) => (
        <span class="c-timing">
          ≈ {usd(r.est)}
          <small>{pct(r.pricedShare, 0)} priced</small>
        </span>
      ),
    },
    { id: "rec", title: "Recorded", value: (r) => r.rec, render: (r) => usd(r.rec) },
    { id: "steps", title: "Steps", value: (r) => r.steps, render: (r) => int(r.steps) },
    { id: "prompts", title: "Prompts", value: (r) => r.prompts, render: (r) => int(r.prompts) },
    { id: "toolCalls", title: "Tool calls", value: count, render: (r) => int(count(r)) },
    { id: "sessions", title: "Sessions", value: (r) => r.sessions, render: (r) => int(r.sessions) },
    {
      id: "cacheHitRate",
      title: "Cache hit",
      value: (r) => r.cacheHitRate,
      render: (r) => pct(r.cacheHitRate),
    },
    {
      id: "respMedian",
      title: "Response p50 / p95",
      value: (r) => r.respMedian,
      render: (r) => (
        <span class="c-timing">
          {duration(r.respMedian)} / {duration(r.respP95)}
          <small>{pct(r.respBasis / (r.steps || 1), 0)} timed</small>
        </span>
      ),
    },
    {
      id: "failureRate",
      title: "Failure rate",
      value: (r) => r.failureRate,
      render: (r) => pct(r.failureRate),
    },
  ];
  const total = createMemo<Row>(() => ({
    ...now(),
    key: "__total",
    label: "Total",
    share: 1,
    first: 0,
    last: 0,
    models: [],
  }));
  const [sort, setSort] = createSignal({ id: "first", dir: -1 });
  const sorted = createMemo(() => {
    const column = columns.find((c) => c.id === sort().id)!;
    return rows().toSorted((a, b) => {
      const x = column.value(a) ?? -Infinity;
      const y = column.value(b) ?? -Infinity;
      return (x < y ? -1 : x > y ? 1 : 0) * sort().dir;
    });
  });
  const line = (r: Row, isTotal = false) => (
    <tr
      classList={{
        "c-total": isTotal,
        "c-clickable": !isTotal,
        "c-filtered-row": !!dash.filters().session?.includes(r.key),
      }}
      onClick={() => !isTotal && dash.toggleFilter("session", r.key)}
    >
      <For each={columns}>
        {(c) => (
          <td classList={{ "c-left": c.left, num: !c.left, "c-chosen": c.id === "tokens" }}>
            <Show when={c.id === "label" && !isTotal} fallback={c.render(r)}>
              <button
                type="button"
                class="c-row-button"
                onClick={(e) => {
                  e.stopPropagation();
                  dash.toggleFilter("session", r.key);
                }}
              >
                {c.render(r)}
              </button>
            </Show>
          </td>
        )}
      </For>
    </tr>
  );
  return (
    <section class="c-breakdown">
      <div class="c-table-header">
        <h2>
          Session breakdown <span class="c-note num">{int(rows().length)} values</span>
        </h2>
        <span class="c-note">Click a row to filter · click a column to sort</span>
      </div>
      <div class="c-table-scroll">
        <table class="c-table">
          <thead>
            <tr>
              <For each={columns}>
                {(c) => (
                  <th
                    classList={{ "c-left": c.left, "c-chosen": c.id === "tokens" }}
                    aria-sort={
                      sort().id === c.id ? (sort().dir < 0 ? "descending" : "ascending") : "none"
                    }
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setSort((s) => ({ id: c.id, dir: s.id === c.id ? -s.dir : -1 }))
                      }
                    >
                      {c.title}
                      {sort().id === c.id ? (sort().dir < 0 ? " ↓" : " ↑") : ""}
                    </button>
                  </th>
                )}
              </For>
            </tr>
          </thead>
          <tbody>
            {line(total(), true)}
            <For each={sorted()}>{(r) => line(r)}</For>
          </tbody>
        </table>
      </div>
      <Show when={!rows().length}>
        <div class="c-empty">No sessions match this range and filters.</div>
      </Show>
      <div class="c-table-notes">
        <span>
          Session numbers include subagent sessions. ≈Cost is estimated; recorded cost is separate.
        </span>
        <span>Response time: timed steps only, from Aug 24, 2026. Basis shown per row.</span>
      </div>
    </section>
  );
}
