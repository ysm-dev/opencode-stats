// PROTOTYPE: variant E's all-metrics tables. Wide, they are E's tables. Narrow, one of:
//  - scroll: the same table scrolling sideways, its name column pinned and the chosen metric
//    moved next to it;
//  - cards: one fixed-height card per row, every metric labelled, sorted from a menu;
//  - pivot: the name and the chosen metric only; a tap opens a sheet with every metric and the
//    filter toggle.
// Rows keep fixed heights in every form, so long lists can still draw only what's on screen.
import { createMemo, createSignal, For, type JSX, Show } from "solid-js";
import {
  breakdown,
  type Dimension,
  percentile,
  toolBreakdown,
  toolsIn,
  type Totals,
} from "../../data/query";
import type { Metric } from "../../data/series";
import { compact, dateTime, duration, int, pct, usd } from "../../format";
import { dash } from "../../state";
import { callsBy } from "../c-explorer/model";
import { narrow } from "./media";
import type { Mix } from "./mix";
import { Menu, Sheet } from "./overlay";

type Cell = number | string | null;
interface Row {
  key: string;
  label: string;
  sub?: string;
  cells: Record<string, Cell>;
}
interface Col {
  id: string;
  label: string;
  render: (r: Row) => JSX.Element;
  left?: boolean;
}
export interface TableSpec {
  title: string;
  name: string;
  noun: string;
  columns: Col[];
  rows: Row[];
  total: Row;
  chosen: string;
  sort: string;
  dim?: Exclude<Dimension, "variant" | "provider">;
  notes: string[];
}

const num = (r: Row, id: string): number | null =>
  typeof r.cells[id] === "number" ? (r.cells[id] as number) : null;
const plain = (id: string, label: string, format = compact): Col => ({
  id,
  label,
  render: (r) =>
    r.cells[id] === undefined || r.cells[id] === null ? "–" : format(num(r, id) ?? 0),
});
const rate = (id: string, label: string): Col => ({ id, label, render: (r) => pct(num(r, id)) });
const usage: Col[] = [
  plain("tokens", "Tokens"),
  {
    id: "est",
    label: "≈ Cost",
    render: (r) => (
      <span class="c-timing">
        <span>≈ {usd(num(r, "est") ?? 0)}</span>
        <small>{pct(num(r, "pricedShare"), 0)} priced</small>
      </span>
    ),
  },
  plain("rec", "Recorded", usd),
  plain("steps", "Steps"),
  plain("prompts", "Prompts"),
  plain("toolCalls", "Tool calls"),
  plain("sessions", "Sessions", int),
  rate("cacheHitRate", "Cache hit"),
  {
    id: "respMedian",
    label: "Response p50 / p95",
    render: (r) => (
      <span class="c-timing">
        <span>
          {duration(num(r, "respMedian"))} / {duration(num(r, "respP95"))}
        </span>
        <small>{r.cells.basis ?? "–"}</small>
      </span>
    ),
  },
  rate("failureRate", "Failure rate"),
];

type UsageRow = Pick<
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
function usageCells(r: UsageRow, calls: number): Record<string, Cell> {
  return {
    tokens: r.tokens,
    est: r.est,
    pricedShare: r.pricedShare,
    rec: r.rec,
    steps: r.steps,
    prompts: r.prompts,
    toolCalls: calls,
    sessions: r.sessions,
    cacheHitRate: r.cacheHitRate,
    respMedian: r.respMedian,
    respP95: r.respP95,
    failureRate: r.failureRate,
    basis: `${pct(r.respBasis / (r.steps || 1), 0)} timed`,
  };
}

const NOTES = {
  overlap:
    "Sessions overlap across rows; the total counts each once. ≈ Cost is estimated; recorded cost is separate.",
  timing: "Response time: timed steps only, from Aug 24, 2026. Basis shown per row.",
};

export function usageTable(
  cut: "model" | "project" | "agent",
  metric: Metric,
  t: Totals,
): TableSpec {
  const calls = callsBy(cut);
  const rows = breakdown(dash.db(), dash.filters(), dash.range(), cut, dash.firsts()).map((r) => ({
    key: r.key,
    label: r.label,
    sub: r.sub,
    cells: usageCells(r, calls.get(r.key) ?? 0),
  }));
  const name = cut === "model" ? "Model" : cut === "project" ? "Project" : "Agent";
  return {
    title: `${name} breakdown`,
    name,
    noun: "values",
    columns: usage,
    rows,
    total: { key: "__total", label: "Total", cells: usageCells(t, t.toolCalls) },
    chosen: metric,
    sort: "tokens",
    dim: cut,
    notes: [NOTES.overlap, NOTES.timing],
  };
}

export function sessionTable(t: Totals): TableSpec {
  const calls = callsBy("session");
  const rows = breakdown(dash.db(), dash.filters(), dash.range(), "session", dash.firsts()).map(
    (r) => ({
      key: r.key,
      label: r.label,
      sub: r.sub,
      cells: {
        ...usageCells(r, calls.get(r.key) ?? 0),
        project: r.sub ?? "–",
        first: dash.firsts().sessions.get(Number(r.key)) ?? r.first,
      },
    }),
  );
  return {
    title: "Session breakdown",
    name: "Session",
    noun: "sessions",
    columns: [
      {
        id: "project",
        label: "Project",
        left: true,
        render: (r) => String(r.cells.project ?? "–"),
      },
      {
        id: "first",
        label: "Started",
        render: (r) => (num(r, "first") === null ? "–" : dateTime(num(r, "first")!)),
      },
      ...usage,
    ],
    rows,
    total: {
      key: "__total",
      label: "Total",
      cells: { ...usageCells(t, t.toolCalls), first: null },
    },
    chosen: "tokens",
    sort: "first",
    dim: "session",
    notes: [
      "Session numbers include subagent sessions. ≈ Cost is estimated; recorded cost is separate.",
      NOTES.timing,
    ],
  };
}

export function toolTable(t: Totals): TableSpec {
  const runs = toolsIn(dash.db(), dash.filters(), dash.range())
    .flatMap((c) => (c.run === null ? [] : [c.run]))
    .toSorted((a, b) => a - b);
  return {
    title: "Tool breakdown",
    name: "Tool",
    noun: "tools",
    columns: [
      plain("calls", "Calls"),
      {
        id: "succeeded",
        label: "Succeeded / failed / stopped",
        render: (r) => (
          <span class="c-outcomes">
            <span>{int(num(r, "succeeded") ?? 0)}</span>
            <span>{int(num(r, "failed") ?? 0)}</span>
            <span>{int(num(r, "stopped") ?? 0)}</span>
          </span>
        ),
      },
      rate("failureRate", "Failure rate"),
      {
        id: "runMedian",
        label: "Run time p50 / p95",
        render: (r) => `${duration(num(r, "runMedian"))} / ${duration(num(r, "runP95"))}`,
      },
      rate("timed", "% timed"),
    ],
    rows: toolBreakdown(dash.db(), dash.filters(), dash.range()).map((r) => ({
      key: r.key,
      label: r.key,
      cells: { ...r, timed: r.runBasis / r.calls },
    })),
    total: {
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
    },
    chosen: "calls",
    sort: "calls",
    dim: "tool",
    notes: ["Run time: timed calls only, from Aug 24, 2026. % timed is the basis for each row."],
  };
}

function compare(a: Row, b: Row, id: string): number {
  const x = id === "label" ? a.label : (a.cells[id] ?? -Infinity);
  const y = id === "label" ? b.label : (b.cells[id] ?? -Infinity);
  return x < y ? -1 : x > y ? 1 : 0;
}

export function MetricTable(props: { spec: TableSpec; mode: Mix["table"] }) {
  const [sort, setSort] = createSignal<{ id: string; dir: 1 | -1 } | null>(null);
  const [open, setOpen] = createSignal<Row | null>(null);
  const current = () => sort() ?? { id: props.spec.sort, dir: -1 as const };
  const sorted = createMemo(() =>
    props.spec.rows.toSorted((a, b) => compare(a, b, current().id) * current().dir),
  );
  const toggleSort = (id: string) =>
    setSort((s) => ({
      id,
      dir: s?.id === id || (!s && props.spec.sort === id) ? (-current().dir as 1 | -1) : -1,
    }));
  const selected = (r: Row) =>
    !!props.spec.dim && !!dash.filters()[props.spec.dim]?.includes(r.key);
  const toggle = (r: Row) => props.spec.dim && dash.toggleFilter(props.spec.dim, r.key);
  const chosenCol = () => props.spec.columns.find((c) => c.id === props.spec.chosen);
  const form = () => (narrow() ? props.mode : "wide");
  return (
    <section class="c-breakdown m-table" data-form={form()} aria-label={props.spec.title}>
      <div class="c-table-header">
        <h2>
          {props.spec.title}{" "}
          <span class="c-note num">
            {int(props.spec.rows.length)} {props.spec.noun}
          </span>
        </h2>
        <Show
          when={form() === "cards"}
          fallback={
            <span class="c-note m-table-hint">
              {form() === "pivot"
                ? "Tap a row for every metric"
                : "Click a row to filter · click a column to sort"}
            </span>
          }
        >
          <Menu
            ariaLabel="Sort rows"
            label={
              <span>
                Sort:{" "}
                {
                  [{ id: "label", label: props.spec.name }, ...props.spec.columns].find(
                    (c) => c.id === current().id,
                  )?.label
                }{" "}
                {current().dir < 0 ? "↓" : "↑"}
              </span>
            }
            value={current().id}
            options={[{ id: "label", label: props.spec.name }, ...props.spec.columns].map((c) => ({
              value: c.id,
              label: c.label,
            }))}
            onSelect={toggleSort}
            align="end"
            class="m-select"
          />
        </Show>
      </div>
      <Show when={form() === "wide" || form() === "scroll"}>
        <WideTable
          spec={props.spec}
          rows={sorted()}
          sort={current()}
          onSort={toggleSort}
          pinned={form() === "scroll"}
          selected={selected}
          onRow={toggle}
        />
      </Show>
      <Show when={form() === "cards"}>
        <div class="m-cards">
          <Card spec={props.spec} row={props.spec.total} total />
          <For each={sorted()}>
            {(r) => (
              <Card spec={props.spec} row={r} selected={selected(r)} onClick={() => toggle(r)} />
            )}
          </For>
        </div>
      </Show>
      <Show when={form() === "pivot"}>
        <Pivot
          spec={props.spec}
          rows={sorted()}
          chosen={chosenCol()}
          sort={current()}
          onSort={toggleSort}
          selected={selected}
          onOpen={setOpen}
        />
      </Show>
      <Show when={!props.spec.rows.length}>
        <div class="c-empty">
          No matching activity in this range. Clear a filter or choose another preset.
        </div>
      </Show>
      <div class="c-table-notes">
        <For each={props.spec.notes}>{(n) => <span>{n}</span>}</For>
      </div>
      <Sheet open={!!open()} title={open()?.label ?? ""} onClose={() => setOpen(null)}>
        <Show when={open()}>
          {(r) => (
            <div class="m-detail">
              <Show when={r().sub}>
                <p class="faint">{r().sub}</p>
              </Show>
              <dl>
                <For each={props.spec.columns}>
                  {(c) => (
                    <div classList={{ "m-detail-chosen": c.id === props.spec.chosen }}>
                      <dt>{c.label}</dt>
                      <dd class="num">{c.render(r())}</dd>
                    </div>
                  )}
                </For>
              </dl>
              <Show when={props.spec.dim && r().key !== "__total"}>
                <button
                  type="button"
                  class="m-detail-filter"
                  onClick={() => {
                    toggle(r());
                    setOpen(null);
                  }}
                >
                  {selected(r())
                    ? "Remove this filter"
                    : `Filter to this ${props.spec.name.toLowerCase()}`}
                </button>
              </Show>
            </div>
          )}
        </Show>
      </Sheet>
    </section>
  );
}

function NameCell(props: { row: Row }) {
  return (
    <span class="c-table-name">
      <span>{props.row.label}</span>
      <Show when={props.row.sub}>
        <small>{props.row.sub}</small>
      </Show>
    </span>
  );
}

function WideTable(props: {
  spec: TableSpec;
  rows: Row[];
  sort: { id: string; dir: number };
  onSort: (id: string) => void;
  pinned: boolean;
  selected: (r: Row) => boolean;
  onRow: (r: Row) => void;
}) {
  // Pinned (narrow): the chosen metric moves next to the name, so it shows without scrolling.
  const columns = () => {
    const all = props.spec.columns;
    if (!props.pinned) return all;
    const chosen = all.filter((c) => c.id === props.spec.chosen);
    return [...chosen, ...all.filter((c) => c.id !== props.spec.chosen)];
  };
  const head = (id: string, label: string, left?: boolean) => (
    <th
      classList={{ "c-left": left, "c-chosen": props.spec.chosen === id }}
      aria-sort={props.sort.id === id ? (props.sort.dir < 0 ? "descending" : "ascending") : "none"}
    >
      <button type="button" onClick={() => props.onSort(id)}>
        {label}
        {props.sort.id === id ? (props.sort.dir < 0 ? " ↓" : " ↑") : ""}
      </button>
    </th>
  );
  const line = (r: Row, total = false) => (
    <tr
      classList={{
        "c-total": total,
        "c-clickable": !total && !!props.spec.dim,
        "c-filtered-row": !total && props.selected(r),
      }}
      onClick={() => !total && props.onRow(r)}
    >
      <td class="c-left">
        <NameCell row={r} />
      </td>
      <For each={columns()}>
        {(c) => (
          <td
            classList={{ "c-left": c.left, num: !c.left, "c-chosen": c.id === props.spec.chosen }}
          >
            {c.render(r)}
          </td>
        )}
      </For>
    </tr>
  );
  return (
    <div class="c-table-scroll" classList={{ "m-pin": props.pinned }}>
      <table class="c-table">
        <thead>
          <tr>
            {head("label", props.spec.name, true)}
            <For each={columns()}>{(c) => head(c.id, c.label, c.left)}</For>
          </tr>
        </thead>
        <tbody>
          {line(props.spec.total, true)}
          <For each={props.rows}>{(r) => line(r)}</For>
        </tbody>
      </table>
    </div>
  );
}

function Card(props: {
  spec: TableSpec;
  row: Row;
  total?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  const chosen = () => props.spec.columns.find((c) => c.id === props.spec.chosen);
  const rest = () => props.spec.columns.filter((c) => c.id !== props.spec.chosen);
  return (
    <div
      class="m-card"
      classList={{ "m-card-total": props.total, "m-card-on": props.selected }}
      role={props.onClick ? "button" : undefined}
      tabindex={props.onClick ? 0 : undefined}
      aria-pressed={props.onClick ? !!props.selected : undefined}
      onClick={() => props.onClick?.()}
      onKeyDown={(e) => e.key === "Enter" && props.onClick?.()}
    >
      <div class="m-card-head">
        <div class="m-card-name">
          <span>{props.row.label}</span>
          <small>
            {props.row.sub ??
              (props.total ? `${int(props.spec.rows.length)} ${props.spec.noun}` : "")}
          </small>
        </div>
        <Show when={chosen()}>
          {(c) => (
            <div class="m-card-chosen num">
              <small>{c().label}</small>
              {c().render(props.row)}
            </div>
          )}
        </Show>
      </div>
      <dl class="m-card-grid">
        <For each={rest()}>
          {(c) => (
            <div>
              <dt>{c.label}</dt>
              <dd class="num">{c.render(props.row)}</dd>
            </div>
          )}
        </For>
      </dl>
    </div>
  );
}

function Pivot(props: {
  spec: TableSpec;
  rows: Row[];
  chosen: Col | undefined;
  sort: { id: string; dir: number };
  onSort: (id: string) => void;
  selected: (r: Row) => boolean;
  onOpen: (r: Row) => void;
}) {
  const max = createMemo(() =>
    Math.max(1, ...props.rows.map((r) => num(r, props.spec.chosen) ?? 0)),
  );
  const line = (r: Row, total = false) => (
    <button
      type="button"
      class="m-pivot-row"
      classList={{ "m-pivot-total": total, "m-pivot-on": !total && props.selected(r) }}
      onClick={() => props.onOpen(r)}
    >
      <Show when={!total && num(r, props.spec.chosen) !== null}>
        <span
          class="m-pivot-bar"
          style={{ width: `${((num(r, props.spec.chosen) ?? 0) / max()) * 100}%` }}
        />
      </Show>
      <span class="m-pivot-name">
        <span>{r.label}</span>
        <small>{r.sub ?? (total ? `${int(props.rows.length)} ${props.spec.noun}` : "")}</small>
      </span>
      <span class="m-pivot-value num">{props.chosen?.render(r)}</span>
      <span class="m-pivot-more" aria-hidden="true">
        ›
      </span>
    </button>
  );
  return (
    <div class="m-pivot">
      <div class="m-pivot-head">
        <button type="button" onClick={() => props.onSort("label")}>
          {props.spec.name}
          {props.sort.id === "label" ? (props.sort.dir < 0 ? " ↓" : " ↑") : ""}
        </button>
        <button type="button" onClick={() => props.onSort(props.spec.chosen)}>
          {props.chosen?.label}
          {props.sort.id === props.spec.chosen ? (props.sort.dir < 0 ? " ↓" : " ↑") : ""}
        </button>
      </div>
      {line(props.spec.total, true)}
      <For each={props.rows}>{(r) => line(r)}</For>
    </div>
  );
}
