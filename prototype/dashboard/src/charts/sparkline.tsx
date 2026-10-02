// PROTOTYPE: a tiny inline trend line for headline numbers. Partial last bucket is dashed.
import { createMemo } from "solid-js";

export function Sparkline(props: {
  values: number[];
  partialLast?: boolean;
  width?: number;
  height?: number;
  color?: string;
}) {
  const w = () => props.width ?? 96;
  const h = () => props.height ?? 24;
  const points = createMemo(() => {
    const v = props.values.map((x) => (Number.isNaN(x) ? 0 : x));
    const max = Math.max(...v, 0) || 1;
    const dx = v.length > 1 ? w() / (v.length - 1) : 0;
    return v.map((x, i) => [i * dx, h() - 2 - (x / max) * (h() - 4)] as const);
  });
  const path = (pts: readonly (readonly [number, number])[]) =>
    pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const solid = () => (props.partialLast ? points().slice(0, -1) : points());
  const dashed = () => (props.partialLast ? points().slice(-2) : []);
  return (
    <svg width={w()} height={h()} viewBox={`0 0 ${w()} ${h()}`} aria-hidden="true">
      <path
        d={path(solid())}
        fill="none"
        stroke={props.color ?? "var(--chart-1)"}
        stroke-width="1.5"
      />
      <path
        d={path(dashed())}
        fill="none"
        stroke={props.color ?? "var(--chart-1)"}
        stroke-width="1.5"
        stroke-dasharray="2 2"
      />
    </svg>
  );
}
