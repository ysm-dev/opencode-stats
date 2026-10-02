// PROTOTYPE: local weekday × hour of day, Monday first.
import { createMemo, For } from "solid-js";
import { hour } from "../format";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function Punchcard(props: {
  grid: number[][];
  format: (v: number) => string;
  class?: string;
}) {
  const max = createMemo(() => Math.max(...props.grid.flat(), 0) || 1);
  const cell = 14;
  const gap = 2;
  const left = 30;
  const top = 14;
  const hourLabel = (h: number) => hour(new Date(2026, 0, 5, h).getTime());
  return (
    <svg
      class={props.class}
      viewBox={`0 0 ${left + 24 * (cell + gap)} ${top + 7 * (cell + gap)}`}
      width="100%"
      role="img"
      aria-label="Activity by weekday and hour"
    >
      <For each={[0, 6, 12, 18]}>
        {(h) => (
          <text x={left + h * (cell + gap)} y={10} font-size="9" fill="var(--v2-text-text-faint)">
            {hourLabel(h)}
          </text>
        )}
      </For>
      <For each={props.grid}>
        {(row, d) => (
          <>
            <text
              x={0}
              y={top + d() * (cell + gap) + 11}
              font-size="9"
              fill="var(--v2-text-text-faint)"
            >
              {DAYS[d()]}
            </text>
            <For each={row}>
              {(v, h) => (
                <rect
                  x={left + h() * (cell + gap)}
                  y={top + d() * (cell + gap)}
                  width={cell}
                  height={cell}
                  rx={2}
                  fill={v ? "var(--chart-1)" : "var(--level-0)"}
                  fill-opacity={v ? 0.15 + 0.85 * Math.sqrt(v / max()) : 1}
                >
                  <title>{`${DAYS[d()]} ${hourLabel(h())} · ${props.format(v)}`}</title>
                </rect>
              )}
            </For>
          </>
        )}
      </For>
    </svg>
  );
}
