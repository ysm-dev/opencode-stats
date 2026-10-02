// PROTOTYPE variant A building blocks: raised cards, KPI tiles, a sortable table.
import { createMemo, createSignal, For, type JSX, Show } from "solid-js";
import { Sparkline } from "../../charts/sparkline";
import { changeText } from "../../format";

export function Card(props: {
  title?: JSX.Element;
  actions?: JSX.Element;
  children: JSX.Element;
  class?: string;
  pad?: boolean;
}) {
  return (
    <section class={`a-card ${props.class ?? ""}`}>
      <Show when={props.title || props.actions}>
        <header class="flex h-10 items-center justify-between gap-3 px-4">
          <h2 class="text-[13px] font-medium">{props.title}</h2>
          <div class="flex items-center gap-2">{props.actions}</div>
        </header>
      </Show>
      <div classList={{ "px-4 pb-4": props.pad !== false }}>{props.children}</div>
    </section>
  );
}

export function Kpi(props: {
  label: string;
  value: string;
  approx?: boolean;
  sub?: JSX.Element;
  change?: number | null;
  changeLabel?: string;
  spark?: number[];
  partialLast?: boolean;
}) {
  return (
    <div class="a-kpi">
      <div class="flex items-center justify-between text-[12px] text-v2-text-text-muted">
        <span>{props.label}</span>
        <Show when={props.change !== undefined && props.change !== null}>
          <span class="delta" title={props.changeLabel}>
            {changeText(props.change ?? null)}
          </span>
        </Show>
      </div>
      <div class="mt-1 flex items-end justify-between gap-2">
        <span class="num text-[22px] font-medium leading-7 tracking-tight">
          <Show when={props.approx}>
            <span class="mr-0.5 text-v2-text-text-faint">≈</span>
          </Show>
          {props.value}
        </span>
        <Show when={props.spark}>
          <Sparkline values={props.spark!} partialLast={props.partialLast} width={72} height={22} />
        </Show>
      </div>
      <Show when={props.sub}>
        <div class="mt-1 truncate text-[12px] text-v2-text-text-faint">{props.sub}</div>
      </Show>
    </div>
  );
}

export interface Column<T> {
  id: string;
  label: string;
  value?: (row: T) => number | string | null;
  render?: (row: T) => JSX.Element;
  align?: "left" | "right";
  width?: string;
  title?: string;
}

export function SortTable<T>(props: {
  rows: T[];
  columns: Column<T>[];
  initialSort?: string;
  onRow?: (row: T) => void;
  selected?: (row: T) => boolean;
  limit?: number;
}) {
  const [sort, setSort] = createSignal<{ id: string; dir: 1 | -1 }>({
    id: props.initialSort ?? "",
    dir: -1,
  });
  const sorted = createMemo(() => {
    const col = props.columns.find((c) => c.id === sort().id);
    if (!col?.value) return props.rows;
    const v = col.value;
    return [...props.rows].sort((a, b) => {
      const x = v(a) ?? -Infinity;
      const y = v(b) ?? -Infinity;
      return (x < y ? -1 : x > y ? 1 : 0) * sort().dir;
    });
  });
  const click = (id: string) =>
    setSort((s) => (s.id === id ? { id, dir: s.dir === 1 ? -1 : 1 } : { id, dir: -1 }));
  return (
    <table class="a-table w-full">
      <thead>
        <tr>
          <For each={props.columns}>
            {(c) => (
              <th
                style={{ width: c.width, "text-align": c.align ?? "right" }}
                title={c.title}
                onClick={() => c.value && click(c.id)}
                classList={{ "cursor-pointer": !!c.value }}
              >
                {c.label}
                <Show when={sort().id === c.id}>{sort().dir === -1 ? " ↓" : " ↑"}</Show>
              </th>
            )}
          </For>
        </tr>
      </thead>
      <tbody>
        <For each={sorted().slice(0, props.limit ?? 200)}>
          {(row) => (
            <tr
              onClick={() => props.onRow?.(row)}
              classList={{
                "cursor-pointer": !!props.onRow,
                "a-row-selected": props.selected?.(row) ?? false,
              }}
            >
              <For each={props.columns}>
                {(c) => (
                  <td
                    style={{ "text-align": c.align ?? "right" }}
                    classList={{ num: (c.align ?? "right") === "right" }}
                  >
                    {c.render ? c.render(row) : String(c.value?.(row) ?? "–")}
                  </td>
                )}
              </For>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  );
}

/** A tiny stacked bar for tool-call outcomes. */
export function OutcomeBar(props: {
  succeeded: number;
  failed: number;
  stopped: number;
  width?: number;
}) {
  const total = () => props.succeeded + props.failed + props.stopped || 1;
  const part = (n: number, color: string) => (
    <span
      style={{
        width: `${(n / total()) * 100}%`,
        background: color,
        display: "block",
        height: "100%",
      }}
    />
  );
  return (
    <span
      class="inline-flex h-1.5 overflow-hidden rounded-full align-middle"
      style={{ width: `${props.width ?? 80}px`, background: "var(--level-0)" }}
      title={`${props.succeeded} succeeded · ${props.failed} failed · ${props.stopped} stopped`}
    >
      {part(props.succeeded, "var(--outcome-succeeded)")}
      {part(props.failed, "var(--outcome-failed)")}
      {part(props.stopped, "var(--outcome-stopped)")}
    </span>
  );
}
