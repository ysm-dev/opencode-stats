// PROTOTYPE: a donut for shares of a whole. Only for metrics whose rows add up.
import { createMemo, For } from "solid-js";

export interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

export function Donut(props: {
  slices: Slice[];
  size?: number;
  thickness?: number;
  center?: string;
  sub?: string;
}) {
  const size = () => props.size ?? 120;
  const r = () => size() / 2 - 2;
  const inner = () => r() - (props.thickness ?? 16);
  const arcs = createMemo(() => {
    const total = props.slices.reduce((s, x) => s + x.value, 0) || 1;
    let a = -Math.PI / 2;
    return props.slices.map((s) => {
      const sweep = (s.value / total) * Math.PI * 2;
      const start = a;
      a += sweep;
      return { ...s, start, end: a, share: s.value / total };
    });
  });
  const arc = (start: number, end: number) => {
    const c = size() / 2;
    const large = end - start > Math.PI ? 1 : 0;
    const p = (rad: number, ang: number) => `${c + rad * Math.cos(ang)},${c + rad * Math.sin(ang)}`;
    const e = end - start >= Math.PI * 2 ? end - 0.0001 : end;
    return `M${p(r(), start)}A${r()},${r()} 0 ${large} 1 ${p(r(), e)}L${p(inner(), e)}A${inner()},${inner()} 0 ${large} 0 ${p(inner(), start)}Z`;
  };
  return (
    <svg width={size()} height={size()} viewBox={`0 0 ${size()} ${size()}`} role="img">
      <For each={arcs()}>
        {(s) => (
          <path
            d={arc(s.start, s.end)}
            fill={s.color}
            stroke="var(--v2-background-bg-base)"
            stroke-width="1.5"
          >
            <title>{`${s.label} · ${(s.share * 100).toFixed(1)}%`}</title>
          </path>
        )}
      </For>
      <text
        x="50%"
        y="48%"
        text-anchor="middle"
        font-size="15"
        font-weight="500"
        fill="var(--v2-text-text-base)"
      >
        {props.center ?? ""}
      </text>
      <text x="50%" y="62%" text-anchor="middle" font-size="10" fill="var(--v2-text-text-faint)">
        {props.sub ?? ""}
      </text>
    </svg>
  );
}
