// PROTOTYPE: variant E's weekday × hour grid. Fit keeps 7 rows × 24 columns at any width; turned
// stands it on end (24 rows × 7 columns) on phones, so each cell is wide enough for a finger.
// A tap or hover reads a cell in the line under the grid; nothing hides behind a tooltip.
import { createMemo, createSignal, For, Show } from "solid-js";
import { punchcard } from "../../data/series";
import { hour, int } from "../../format";
import { dash } from "../../state";
import { isTap, phone } from "./media";
import type { Mix } from "./mix";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const hourLabel = (h: number) => hour(new Date(2026, 0, 5, h).getTime());
const biggest = (values: number[]) => values.indexOf(Math.max(...values));

export function Rhythm(props: { mode: Mix["rhythm"] }) {
  const grid = createMemo(() => punchcard(dash.db(), dash.filters(), dash.range(), "steps"));
  const days = createMemo(() => grid().map((row) => row.reduce((s, n) => s + n, 0)));
  const hours = createMemo(() =>
    Array.from({ length: 24 }, (_, h) => grid().reduce((s, row) => s + row[h]!, 0)),
  );
  const max = createMemo(() => Math.max(...grid().flat(), 0) || 1);
  const [pick, setPick] = createSignal<[number, number] | null>(null);
  const turned = () => props.mode === "turn" && phone();
  const fill = (v: number) => (v ? "var(--chart-1)" : "var(--level-0)");
  const opacity = (v: number) => (v ? 0.15 + 0.85 * Math.sqrt(v / max()) : 1);
  const events = (d: number, h: number) => ({
    onPointerEnter: (e: PointerEvent) => !isTap(e) && setPick([d, h]),
    onPointerLeave: (e: PointerEvent) => !isTap(e) && setPick(null),
    onClick: () => setPick([d, h]),
  });
  return (
    <section class="b-section m-rhythm" data-turned={turned()}>
      <header class="b-section-header">
        <h2>Rhythm</h2>
        <span class="b-caption">Steps by weekday × hour · browser timezone</span>
      </header>
      <div class="b-rhythm-layout">
        <div>
          <Show
            when={turned()}
            fallback={
              <svg
                viewBox={`0 0 ${30 + 24 * 16} ${14 + 7 * 16}`}
                width="100%"
                role="img"
                aria-label="Steps by weekday and hour"
              >
                <For each={[0, 6, 12, 18]}>
                  {(h) => (
                    <text x={30 + h * 16} y={10} font-size="9" fill="var(--v2-text-text-faint)">
                      {hourLabel(h)}
                    </text>
                  )}
                </For>
                <For each={grid()}>
                  {(row, d) => (
                    <>
                      <text
                        x={0}
                        y={14 + d() * 16 + 11}
                        font-size="9"
                        fill="var(--v2-text-text-faint)"
                      >
                        {DAYS[d()]}
                      </text>
                      <For each={row}>
                        {(v, h) => (
                          <rect
                            x={30 + h() * 16}
                            y={14 + d() * 16}
                            width={14}
                            height={14}
                            rx={2}
                            fill={fill(v)}
                            fill-opacity={opacity(v)}
                            stroke={
                              pick()?.[0] === d() && pick()?.[1] === h()
                                ? "var(--v2-text-text-base)"
                                : "none"
                            }
                            {...events(d(), h())}
                          />
                        )}
                      </For>
                    </>
                  )}
                </For>
              </svg>
            }
          >
            <div class="m-turned" role="img" aria-label="Steps by hour and weekday">
              <span />
              <For each={DAYS}>{(d) => <span class="m-turned-day">{d.slice(0, 2)}</span>}</For>
              <For each={Array.from({ length: 24 }, (_, h) => h)}>
                {(h) => (
                  <>
                    <span class="m-turned-hour">{h % 3 === 0 ? hourLabel(h) : ""}</span>
                    <For each={grid()}>
                      {(row, d) => (
                        <button
                          type="button"
                          class="m-turned-cell"
                          classList={{ "m-picked": pick()?.[0] === d() && pick()?.[1] === h }}
                          style={{
                            background: row[h]
                              ? `color-mix(in srgb, var(--chart-1) ${Math.round(opacity(row[h]!) * 100)}%, transparent)`
                              : "var(--level-0)",
                          }}
                          aria-label={`${DAYS[d()]} ${hourLabel(h)}: ${int(row[h]!)} steps`}
                          {...events(d(), h)}
                        />
                      )}
                    </For>
                  </>
                )}
              </For>
            </div>
          </Show>
          <p class="m-rhythm-readout">
            {pick()
              ? `${WEEKDAYS[pick()![0]]} ${hourLabel(pick()![1])} · ${int(grid()[pick()![0]]![pick()![1]]!)} steps`
              : "Tap a cell to read it"}
          </p>
        </div>
        <div class="b-rhythm-copy">
          <Show
            when={days().some((n) => n > 0)}
            fallback={<p class="faint">No active hours in this range.</p>}
          >
            <div>
              <div class="b-small-label">Busiest weekday</div>
              <div class="b-rhythm-value">{WEEKDAYS[biggest(days())]}</div>
              <p class="b-caption num">{int(days()[biggest(days())]!)} steps</p>
            </div>
            <div>
              <div class="b-small-label b-hour-label">Busiest hour</div>
              <div class="b-rhythm-value num">{hourLabel(biggest(hours()))}</div>
              <p class="b-caption num">{int(hours()[biggest(hours())]!)} steps, across the range</p>
            </div>
          </Show>
        </div>
      </div>
    </section>
  );
}
