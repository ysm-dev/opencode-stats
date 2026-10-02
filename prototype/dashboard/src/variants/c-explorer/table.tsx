import { createMemo, createSignal, For, Show, type JSX } from "solid-js";
import { breakdown, percentile, toolBreakdown, toolsIn, type Totals } from "../../data/query";
import { KINDS, type Metric } from "../../data/series";
import { compact, dateTime, duration, int, pct, usd } from "../../format";
import { dash } from "../../state";
import { callsBy, dimensions, type Cut } from "./model";

type Cell = number | string | null;
interface TableRow {
  key: string;
  label: string;
  sub?: string;
  cells: Record<string, Cell>;
}
interface Column {
  id: string;
  label: string;
  render: (r: TableRow) => JSX.Element;
  left?: boolean;
}
const numeric = (r: TableRow, id: string): number | null =>
  typeof r.cells[id] === "number" ? r.cells[id] : null;
const numberColumn = (id: string, label: string, format = compact): Column => ({
  id,
  label,
  render: (r) => (r.cells[id] === undefined ? "–" : format(numeric(r, id) ?? 0)),
});
const percentColumn = (id: string, label: string): Column => ({
  id,
  label,
  render: (r) => pct(numeric(r, id)),
});
const nameColumn: Column = {
  id: "label",
  label: "Value",
  left: true,
  render: (r) => (
    <span class="c-table-name">
      <span>{r.label}</span>
      <Show when={r.sub}>
        <small>{r.sub}</small>
      </Show>
    </span>
  ),
};

const usageColumns: Column[] = [
  nameColumn,
  numberColumn("tokens", "Tokens"),
  {
    id: "est",
    label: "≈Cost",
    render: (r) =>
      r.cells.est === undefined ? (
        "–"
      ) : (
        <span class="c-timing">
          <span>≈ {usd(numeric(r, "est") ?? 0)}</span>
          <small>{pct(numeric(r, "pricedShare"), 0)} priced</small>
        </span>
      ),
  },
  numberColumn("rec", "Recorded", usd),
  numberColumn("steps", "Steps"),
  numberColumn("prompts", "Prompts"),
  numberColumn("toolCalls", "Tool calls"),
  numberColumn("sessions", "Sessions", int),
  percentColumn("cacheHitRate", "Cache hit"),
  {
    id: "respMedian",
    label: "Response p50 / p95",
    render: (r) => (
      <span class="c-timing">
        <span>
          {duration(numeric(r, "respMedian"))} / {duration(numeric(r, "respP95"))}
        </span>
        <small>{r.cells.basis ?? "–"}</small>
      </span>
    ),
  },
  percentColumn("failureRate", "Failure rate"),
];
const toolColumns: Column[] = [
  { ...nameColumn, label: "Tool" },
  numberColumn("calls", "Calls"),
  {
    id: "succeeded",
    label: "Outcomes: succeeded / failed / stopped",
    render: (r) => (
      <span class="c-outcomes">
        <span>{int(numeric(r, "succeeded") ?? 0)}</span>
        <span>{int(numeric(r, "failed") ?? 0)}</span>
        <span>{int(numeric(r, "stopped") ?? 0)}</span>
      </span>
    ),
  },
  percentColumn("failureRate", "Failure rate"),
  {
    id: "runMedian",
    label: "Run time p50 / p95",
    render: (r) => `${duration(numeric(r, "runMedian"))} / ${duration(numeric(r, "runP95"))}`,
  },
  percentColumn("timed", "% timed"),
];
const sessionColumns: Column[] = [
  { ...nameColumn, label: "Session" },
  { id: "project", label: "Project", left: true, render: (r) => String(r.cells.project ?? "–") },
  {
    id: "first",
    label: "Started",
    render: (r) => (numeric(r, "first") === null ? "–" : dateTime(numeric(r, "first")!)),
  },
  ...usageColumns.filter((c) => ["steps", "prompts", "tokens", "est"].includes(c.id)),
];

type Usage = Pick<
  Totals,
  | "tokens"
  | "est"
  | "pricedShare"
  | "rec"
  | "steps"
  | "prompts"
  | "sessions"
  | "cacheHitRate"
  | "respMedian"
  | "respP95"
  | "respBasis"
  | "failureRate"
>;
function usageCells(r: Usage, calls: number): Record<string, Cell> {
  return {
    tokens: r.tokens,
    est: r.est,
    pricedShare: r.pricedShare,
    rec: r.rec,
    steps: r.steps,
    prompts: r.prompts,
    sessions: r.sessions,
    cacheHitRate: r.cacheHitRate,
    respMedian: r.respMedian,
    respP95: r.respP95,
    failureRate: r.failureRate,
    toolCalls: calls,
    basis: `${pct(r.respBasis / (r.steps || 1), 0)} timed`,
  };
}

function toolTotal(t: Totals): TableRow {
  const runs = toolsIn(dash.db(), dash.filters(), dash.range())
    .flatMap((c) => (c.run === null ? [] : [c.run]))
    .toSorted((a, b) => a - b);
  return {
    key: "__total",
    label: "Total",
    cells: {
      calls: t.toolCalls,
      succeeded: t.succeeded,
      failed: t.toolFailed,
      stopped: t.stopped,
      failureRate: t.toolFailureRate,
      runMedian: percentile(runs, 0.5),
      runP95: percentile(runs, 0.95),
      timed: runs.length / (t.toolCalls || 1),
    },
  };
}

function tableRows(cut: Cut, t: Totals): TableRow[] {
  if (cut === "kind")
    return KINDS.map((k) => ({
      key: String(k.key),
      label: k.label,
      cells: { tokens: usageKindCells(t)[String(k.key)] ?? 0 },
    }));
  if (cut === "tool")
    return toolBreakdown(dash.db(), dash.filters(), dash.range()).map((r) => ({
      key: r.key,
      label: r.key,
      cells: { ...r, timed: r.runBasis / r.calls },
    }));
  const calls = callsBy(cut);
  const started = new Map<number, number>();
  if (cut === "session")
    for (const step of dash.db().steps)
      if (!started.has(step.session)) started.set(step.session, step.at);
  return breakdown(dash.db(), dash.filters(), dash.range(), cut, dash.firsts()).map((r) => ({
    key: r.key,
    label: r.label,
    sub: cut === "session" ? undefined : r.sub,
    cells: {
      ...usageCells(r, calls.get(r.key) ?? 0),
      project: r.sub ?? "–",
      first: started.get(Number(r.key)) ?? r.first,
    },
  }));
}

function usageKindCells(t: Totals): Record<string, Cell> {
  return {
    input: t.input,
    cacheRead: t.cacheRead,
    cacheWrite: t.cacheWrite,
    output: t.output,
    reasoning: t.reasoning,
  };
}

export function ExplorerTable(props: { cut: Cut; metric: Metric; total: Totals }) {
  const rows = createMemo(() => tableRows(props.cut, props.total));
  const columns = () =>
    props.cut === "tool" ? toolColumns : props.cut === "session" ? sessionColumns : usageColumns;
  const [sort, setSort] = createSignal({ id: "", dir: -1 });
  const sortId = () =>
    columns().some((c) => c.id === sort().id) ? sort().id : defaultSort(props.cut);
  const sorted = createMemo(() => rows().toSorted((a, b) => compare(a, b, sortId()) * sort().dir));
  const total = createMemo<TableRow>(() =>
    props.cut === "tool"
      ? toolTotal(props.total)
      : { key: "__total", label: "Total", cells: usageCells(props.total, props.total.toolCalls) },
  );
  const highlighted = () =>
    props.cut === "tool" && props.metric === "toolCalls" ? "calls" : props.metric;
  function toggleSort(id: string) {
    setSort((s) => ({ id, dir: s.id === id ? -s.dir : -1 }));
  }
  const title = () => dimensions.find((d) => d.id === props.cut)?.label ?? "Value";
  return (
    <section class="c-breakdown" aria-label="Metric breakdown">
      <div class="c-table-header">
        <h2>
          {title()} breakdown <span class="c-note num">{int(rows().length)} values</span>
        </h2>
        <span class="c-note">
          {props.cut === "kind" ? "Token kinds split tokens only" : "Click a row to filter"} · click
          a column to sort
        </span>
      </div>
      <Show when={props.cut === "tool"}>
        <div class="c-table-basis c-note">
          Run time: timed calls only, from Aug 24, 2026. % timed is the basis for each row.
        </div>
      </Show>
      <div class="c-table-scroll">
        <table class="c-table">
          <thead>
            <tr>
              <For each={columns()}>
                {(c) => (
                  <th
                    classList={{ "c-chosen": highlighted() === c.id, "c-left": c.left }}
                    aria-sort={
                      sortId() === c.id ? (sort().dir < 0 ? "descending" : "ascending") : "none"
                    }
                  >
                    <button type="button" onClick={() => toggleSort(c.id)}>
                      {c.id === "label" ? title() : c.label}
                      {sortId() === c.id ? (sort().dir < 0 ? " ↓" : " ↑") : ""}
                    </button>
                  </th>
                )}
              </For>
            </tr>
          </thead>
          <tbody>
            <TableLine row={total()} columns={columns()} highlight={highlighted()} total />
            <For each={sorted()}>
              {(r) => (
                <TableLine
                  row={r}
                  columns={columns()}
                  highlight={highlighted()}
                  selected={props.cut !== "kind" && !!dash.filters()[props.cut]?.includes(r.key)}
                  onClick={
                    props.cut === "kind"
                      ? undefined
                      : () => dash.toggleFilter(props.cut as Exclude<Cut, "kind">, r.key)
                  }
                />
              )}
            </For>
          </tbody>
        </table>
      </div>
      <Show when={!rows().length}>
        <div class="c-empty">
          No matching activity in this range. Clear a filter or choose another preset.
        </div>
      </Show>
      <div class="c-table-notes">
        <Show when={props.cut !== "tool"}>
          <span>
            Sessions overlap across rows; the total counts each once. ≈Cost is estimated; recorded
            cost is separate.
          </span>
        </Show>
        <Show when={props.cut === "kind"}>
          <span>
            Only tokens split by kind. Other metrics belong to steps; token kinds are not filters.
          </span>
        </Show>
        <Show when={props.cut !== "session"}>
          <span>
            {props.cut === "tool" ? "Run time" : "Response time"}: timed records only, from Aug 24,
            2026. Basis shown per row.
          </span>
        </Show>
      </div>
    </section>
  );
}

const defaultSort = (cut: Cut) =>
  cut === "tool" ? "calls" : cut === "session" ? "first" : "tokens";

function compare(a: TableRow, b: TableRow, id: string): number {
  const x = id === "label" ? a.label : (a.cells[id] ?? -Infinity);
  const y = id === "label" ? b.label : (b.cells[id] ?? -Infinity);
  return x < y ? -1 : x > y ? 1 : 0;
}

function TableLine(props: {
  row: TableRow;
  columns: Column[];
  highlight: string;
  total?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <tr
      classList={{
        "c-total": props.total,
        "c-filtered-row": props.selected,
        "c-clickable": !!props.onClick,
      }}
      onClick={props.onClick}
    >
      <For each={props.columns}>
        {(c) => (
          <td classList={{ "c-chosen": props.highlight === c.id, "c-left": c.left, num: !c.left }}>
            <Show when={c.id === "label" && props.onClick} fallback={c.render(props.row)}>
              <button
                type="button"
                class="c-row-button"
                onClick={(e) => {
                  e.stopPropagation();
                  props.onClick?.();
                }}
              >
                {c.render(props.row)}
              </button>
            </Show>
          </td>
        )}
      </For>
    </tr>
  );
}
