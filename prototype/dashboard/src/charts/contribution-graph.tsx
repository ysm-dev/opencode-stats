// PROTOTYPE: the contribution graph is dashboard-owned SVG (issue #8: TanStack has no ready one).
import { createMemo, createSignal, For, Show } from "solid-js";
import type { DayCell } from "../data/series";
import { startOfWeek } from "../data/time";
import { day, month } from "../format";

export interface ContributionGraphProps {
  cells: DayCell[];
  range: { start: number; end: number };
  format: (v: number) => string;
  onSelect?: (t: number) => void;
  cell?: number;
  gap?: number;
  caption?: boolean;
  class?: string;
}

const WEEKDAYS = ["Mon", "", "Wed", "", "Fri", "", ""];

export function ContributionGraph(props: ContributionGraphProps) {
  const size = () => props.cell ?? 11;
  const gap = () => props.gap ?? 3;
  const step = () => size() + gap();
  const left = 28;
  const top = 16;
  const [hover, setHover] = createSignal<DayCell | null>(null);

  const layout = createMemo(() => {
    const first = props.cells[0];
    if (!first) return { placed: [], months: [], columns: 0 };
    const origin = startOfWeek(first.t);
    const placed = props.cells.map((c) => {
      const col = Math.floor(Math.round((startOfWeek(c.t) - origin) / 86400000) / 7);
      const row = (new Date(c.t).getDay() + 6) % 7;
      return { ...c, col, row };
    });
    const months: { col: number; t: number }[] = [];
    let last = -1;
    for (const c of placed) {
      const m = new Date(c.t).getMonth();
      if (m !== last && new Date(c.t).getDate() <= 7) {
        months.push({ col: c.col, t: c.t });
        last = m;
      }
    }
    return { placed, months, columns: (placed[placed.length - 1]?.col ?? 0) + 1 };
  });

  const covers = () => {
    const cells = props.cells;
    return (
      cells.length > 0 &&
      props.range.start <= cells[0]!.t &&
      props.range.end > cells[cells.length - 1]!.t
    );
  };
  const inside = (t: number) => !covers() && t >= props.range.start && t < props.range.end;
  const width = () => left + layout().columns * step();
  const height = () => top + 7 * step();

  return (
    <div class={props.class}>
      <svg
        viewBox={`0 0 ${width()} ${height()}`}
        width="100%"
        style={{ "max-width": `${width() * 1.6}px`, display: "block" }}
        role="img"
        aria-label="Contribution graph of the past 365 days"
      >
        <For each={layout().months}>
          {(m) => (
            <text x={left + m.col * step()} y={10} font-size="10" fill="var(--v2-text-text-faint)">
              {month(m.t, false)}
            </text>
          )}
        </For>
        <For each={WEEKDAYS}>
          {(w, i) => (
            <text
              x={0}
              y={top + i() * step() + size() - 2}
              font-size="9"
              fill="var(--v2-text-text-faint)"
            >
              {w}
            </text>
          )}
        </For>
        <For each={layout().placed}>
          {(c) => (
            <rect
              x={left + c.col * step()}
              y={top + c.row * step()}
              width={size()}
              height={size()}
              rx={2}
              fill={`var(--level-${c.level})`}
              stroke={
                hover()?.t === c.t
                  ? "var(--v2-text-text-base)"
                  : inside(c.t)
                    ? "var(--v2-text-text-muted)"
                    : "none"
              }
              stroke-width={1}
              style={{ cursor: props.onSelect ? "pointer" : "default" }}
              onMouseEnter={() => setHover(c)}
              onMouseLeave={() => setHover(null)}
              onClick={() => props.onSelect?.(c.t)}
            >
              <title>{`${day(c.t, { weekday: true, year: true })} · ${c.value ? props.format(c.value) : "No activity"}`}</title>
            </rect>
          )}
        </For>
      </svg>
      <Show when={props.caption !== false}>
        <div class="mt-1.5 flex items-center justify-between gap-4 text-[12px] text-v2-text-text-faint">
          <span class="num">
            {hover()
              ? `${day(hover()!.t, { weekday: true, year: true })} · ${hover()!.value ? props.format(hover()!.value) : "No activity"}`
              : " "}
          </span>
          <LevelLegend />
        </div>
      </Show>
    </div>
  );
}

export function LevelLegend() {
  return (
    <span class="flex items-center gap-1">
      Less
      <For each={[0, 1, 2, 3, 4]}>
        {(l) => (
          <span
            class="swatch"
            style={{ background: `var(--level-${l})`, width: "10px", height: "10px" }}
          />
        )}
      </For>
      More
    </span>
  );
}
