import {
  For,
  Show,
  createMemo,
  createSignal,
  useContext,
  onCleanup,
  type ParentProps,
  type Accessor,
} from "solid-js";
import { Chart } from "@tanstack/solid-charts";
import { Select } from "@opencode/ui/select";
import { SegmentedControl, SegmentedControlItem } from "@opencode/ui/segmented-control";
import {
  chartMetrics,
  chartSplits,
  chartMetricLabels,
  chartSplitLabels,
} from "@opencode-stats/engine";
import { PageState, PageActions, type CompletePage } from "./page-context.ts";
import { useMediaSize } from "./media-size.tsx";
import {
  chartDrawing,
  chartHeight,
  chartValue,
  chartColour,
  chartMargin,
} from "./chart-drawing.ts";
import { changes, stateMark } from "./change-time.ts";
import { HeadlineText } from "./step-headlines.tsx";

type ReadState = {
  chart: CompletePage["chart"];
  bucket: number | null;
  highlighted: string | null;
  pointed: string | null;
  focused: string | null;
  spoken: string;
};
const atRest = (chart: CompletePage["chart"]): ReadState => ({
  chart,
  bucket: null,
  highlighted: null,
  pointed: null,
  focused: null,
  spoken: chart.announcement,
});
const ChartAmount = (props: { metric: CompletePage["chart"]["metric"]; value: number | null }) => (
  <HeadlineText
    about={props.metric === "cost"}
    text={chartValue(props.metric, props.value).replace(/^≈ /, "")}
  />
);

const ChoiceForm = (props: ParentProps) => {
  let focused: "metric" | "split" | null = null;
  const focus = () => {
    const field = document.activeElement!.closest(
      ".chart-choices [aria-label], .chart-choices [aria-labelledby]",
    )!;
    const label = field.getAttribute("aria-label") ?? field.getAttribute("aria-labelledby");
    focused = label === "Chart metric" || label === "chart-metric-label" ? "metric" : "split";
  };
  onCleanup(() => {
    const name = focused;
    if (name === null) return;
    queueMicrotask(() => {
      const replacement = document.querySelector<HTMLElement>(
        `.chart-choices [aria-labelledby="chart-${name}-label"], .chart-choices [aria-label="Chart ${name}"] [aria-pressed="true"]`,
      );
      if (replacement) changes.local("resize", () => replacement.focus());
    });
  });
  return (
    <div
      class="chart-choice-form"
      onFocusIn={focus}
      onFocusOut={(event) => {
        const next = event.relatedTarget;
        if (
          next instanceof Element &&
          !event.currentTarget.contains(next) &&
          !next.closest(".chart-options")
        )
          focused = null;
      }}
    >
      {props.children}
    </div>
  );
};

const ChartChoices = () => {
  const state = useContext(PageState)!;
  const actions = useContext(PageActions)!;
  const media = useMediaSize();
  const splits = () =>
    chartSplits.filter((split) => split !== "token-kind" || state().chart.metric === "tokens");
  const optionsClass = () =>
    `settings-options chart-options${media().coarse ? " chart-options-coarse" : ""}`;
  const [menus, setMenus] = createSignal({ metric: false, split: false });
  const menu = (kind: "metric" | "split", open: boolean) =>
    changes.local("chart-menu", () => setMenus((before) => ({ ...before, [kind]: open })));
  const selectMetric = (metric: CompletePage["chart"]["metric"] | null) => {
    if (metric) void actions.request({ kind: "chart-metric", metric });
  };
  const selectSplit = (split: CompletePage["chart"]["split"] | null) => {
    if (split) void actions.request({ kind: "chart-split", split });
  };
  return (
    <div
      class="chart-choices"
      data-state={stateMark(state())}
      data-local-state={stateMark(menus())}
      data-media-state={stateMark(media())}
    >
      <Show
        when={media().columnWidth < 1120}
        fallback={
          <ChoiceForm>
            <SegmentedControl
              value={state().chart.metric}
              aria-label="Chart metric"
              class="chart-segments"
            >
              <For each={chartMetrics}>
                {(metric) => (
                  <SegmentedControlItem value={metric} onClick={() => selectMetric(metric)}>
                    {chartMetricLabels[metric]}
                  </SegmentedControlItem>
                )}
              </For>
            </SegmentedControl>
            <SegmentedControl
              value={state().chart.split}
              aria-label="Chart split"
              class="chart-segments"
            >
              <For each={splits()}>
                {(split) => (
                  <SegmentedControlItem value={split} onClick={() => selectSplit(split)}>
                    {chartSplitLabels[split]}
                  </SegmentedControlItem>
                )}
              </For>
            </SegmentedControl>
          </ChoiceForm>
        }
      >
        <ChoiceForm>
          <span class="sr-only" id="chart-metric-label">
            Chart metric
          </span>
          <Select
            options={[...chartMetrics]}
            current={state().chart.metric}
            label={(metric) => chartMetricLabels[metric]}
            aria-labelledby="chart-metric-label"
            fitViewport
            onSelect={selectMetric}
            open={menus().metric}
            onOpenChange={(open) => menu("metric", open)}
            contentClass={optionsClass()}
          />
          <span class="sr-only" id="chart-split-label">
            Chart split
          </span>
          <Select
            options={splits()}
            current={state().chart.split}
            label={(split) => chartSplitLabels[split]}
            aria-labelledby="chart-split-label"
            fitViewport
            onSelect={selectSplit}
            open={menus().split}
            onOpenChange={(open) => menu("split", open)}
            contentClass={optionsClass()}
          />
        </ChoiceForm>
      </Show>
    </div>
  );
};

const ChartReadout = (props: {
  state: Accessor<CompletePage>;
  local: Accessor<ReadState>;
  preserveFocus: (button: HTMLButtonElement) => void;
  drill: () => void;
  clear: () => void;
  highlight: (source: "pointed" | "focused", id: string | null) => void;
}) => {
  const bucket = () =>
    props.local().bucket === null ? undefined : props.local().chart.buckets[props.local().bucket!];
  return (
    <div
      class="chart-readout"
      data-state={stateMark(props.state())}
      data-local-state={stateMark(props.local())}
    >
      <h3>{bucket()?.title ?? "Range totals"}</h3>
      <p class="chart-total">
        Total ·{" "}
        <ChartAmount
          metric={props.local().chart.metric}
          value={bucket() ? bucket()!.total : props.local().chart.total}
        />
      </p>
      <p>{bucket()?.basis ?? props.local().chart.basis}</p>
      <Show when={bucket()}>
        <div class="chart-read-actions">
          <Show when={props.local().chart.unit !== "hour"}>
            <button ref={props.preserveFocus} type="button" onClick={props.drill}>
              Drill in
            </button>
          </Show>
          <button
            ref={props.preserveFocus}
            type="button"
            aria-label="Clear chart reading"
            onClick={props.clear}
          >
            ×
          </button>
        </div>
      </Show>
      <ul>
        <For each={props.local().chart.series.map((series) => series.id)}>
          {(id, index) => {
            const series = () => props.local().chart.series[index()]!;
            return (
              <li>
                <button
                  ref={props.preserveFocus}
                  type="button"
                  aria-pressed={props.local().highlighted === id}
                  onPointerEnter={() => props.highlight("pointed", id)}
                  onPointerLeave={() => props.highlight("pointed", null)}
                  onFocus={() => props.highlight("focused", id)}
                  onBlur={() => props.highlight("focused", null)}
                  onClick={() => props.highlight("pointed", id)}
                >
                  <span
                    class="chart-swatch"
                    style={{ background: chartColour(id, index()) }}
                    aria-hidden="true"
                  />
                  {series().name}
                  <span>
                    <ChartAmount
                      metric={props.local().chart.metric}
                      value={bucket() ? bucket()!.values[index()]! : series().total}
                    />
                  </span>
                </button>
              </li>
            );
          }}
        </For>
      </ul>
    </div>
  );
};

export const UsageChart = () => {
  const state = useContext(PageState)!;
  const actions = useContext(PageActions)!;
  const media = useMediaSize();
  const [stored, setStored] = createSignal(atRest(state().chart));
  let surface!: HTMLDivElement;
  const preserveFocus = (button: HTMLButtonElement) =>
    onCleanup(() => {
      if (document.activeElement === button) surface.focus();
    });
  const width = createMemo(() => Math.max(1, media().columnWidth));
  const height = createMemo(() => chartHeight(media().columnWidth));
  const size = createMemo(() => ({ width: width(), height: height() }));
  const local = createMemo(() => {
    const previous = stored();
    const chart = state().chart;
    if (previous.chart === chart) return previous;
    const keep = (id: string | null) =>
      chart.series.some((series) => series.id === id) ? id : null;
    const pointed = keep(previous.pointed);
    const focused = keep(previous.focused);
    return {
      ...atRest(chart),
      pointed,
      focused,
      highlighted: keep(previous.highlighted) ?? pointed ?? focused,
    };
  });
  const drawing = createMemo(() => chartDrawing(local().chart, local().highlighted));
  const read = (index: number | null, speak = false) =>
    changes.local("chart-read", () => {
      const chart = local().chart;
      const selected = index === null ? undefined : chart.buckets[index];
      const spoken =
        speak && selected
          ? `${selected.title}. Total: ${chartValue(chart.metric, selected.total)}. ${chart.series.map((series, position) => `${series.name}: ${chartValue(chart.metric, selected.values[position]!)}`).join(". ")}. ${selected.basis}`.replaceAll(
              "≈",
              "about",
            )
          : "";
      setStored({ ...local(), bucket: index, spoken });
    });
  const highlight = (source: "pointed" | "focused", id: string | null) =>
    changes.local("chart-highlight", () => {
      const next = { ...local(), [source]: id };
      const fallback = source === "pointed" ? next.focused : next.pointed;
      setStored({ ...next, highlighted: id ?? fallback });
    });
  const drill = (index = local().bucket, started = performance.now()) => {
    const chart = local().chart;
    if (index !== null && chart.unit !== "hour") {
      surface.focus();
      const selected = chart.buckets[index]!;
      void actions.request(
        { kind: "drill", from: selected.from, to: selected.to, unit: chart.unit },
        started,
      );
    }
  };
  const nearest = (event: MouseEvent) => {
    if (local().chart.buckets.length === 0) return null;
    const bounds = surface.getBoundingClientRect();
    return Math.max(
      0,
      Math.min(
        local().chart.buckets.length - 1,
        Math.floor(
          ((event.clientX - bounds.left - chartMargin.left) /
            Math.max(1, bounds.width - chartMargin.left - chartMargin.right)) *
            local().chart.buckets.length,
        ),
      ),
    );
  };
  let gesture: { x: number; y: number; vertical: boolean } | undefined;
  let clickedBy = "mouse";
  const down = (event: PointerEvent) => {
    clickedBy = event.pointerType;
    if (event.pointerType !== "mouse")
      gesture = { x: event.clientX, y: event.clientY, vertical: false };
  };
  const move = (event: PointerEvent) => {
    if (event.pointerType === "mouse") {
      changes.local("chart-read", () => read(nearest(event)));
      return;
    }
    if (!gesture || gesture.vertical) return;
    const x = Math.abs(event.clientX - gesture.x);
    const y = Math.abs(event.clientY - gesture.y);
    if (y > x && y > 8) {
      gesture.vertical = true;
      return;
    }
    if (x > 8) changes.local("chart-read", () => read(nearest(event)));
  };
  const up = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" && gesture && !gesture.vertical)
      changes.local("chart-read", () => read(nearest(event)));
    gesture = undefined;
  };
  const click = (event: MouseEvent) => {
    const started = performance.now();
    const pointerType = "pointerType" in event ? event.pointerType : clickedBy;
    if (pointerType === "mouse") drill(nearest(event), started);
  };
  const key = (event: KeyboardEvent) => {
    const count = local().chart.buckets.length;
    if (count === 0) return;
    const position = local().bucket;
    const indices: Record<string, number> = {
      ArrowLeft: position === null ? count - 1 : Math.max(0, position - 1),
      ArrowRight: position === null ? 0 : Math.min(count - 1, position + 1),
      Home: 0,
      End: count - 1,
    };
    const index = indices[event.key];
    if (index !== undefined) {
      event.preventDefault();
      read(index, true);
    } else if (event.key === "Enter") {
      event.preventDefault();
      drill();
    } else if (event.key === "Escape") {
      event.preventDefault();
      read(null);
    }
  };
  const clear = () =>
    changes.local("chart-read", () => {
      surface.focus();
      read(null);
    });
  return (
    <section
      class="usage-chart"
      style={{ "--chart-axis-width": `${chartMargin.left}px` }}
      aria-labelledby="usage-over-time"
      data-media-state={stateMark(media())}
      data-coarse={media().coarse}
      data-forced-colours={media().forcedColours}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") read(null);
      }}
    >
      <h2 id="usage-over-time">Usage over time</h2>
      <ChartChoices />
      <Show when={!local().chart.additive}>
        <p>Shown as one unsplit line.</p>
      </Show>
      <div
        ref={(element) => {
          surface = element;
        }}
        class="chart-hit"
        role="group"
        aria-roledescription="chart"
        tabIndex={0}
        aria-label={`${local().chart.name.replace("≈", "about")}, ${state().rangeLabel}, by ${local().chart.unit}`}
        aria-describedby="chart-instructions"
        data-state={stateMark(state())}
        data-local-state={stateMark(local())}
        data-media-state={stateMark(media())}
        data-size-state={stateMark(size())}
        onKeyDown={key}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onClick={click}
        onPointerCancel={() => {
          gesture = undefined;
        }}
      >
        <div aria-hidden="true">
          <Chart
            definition={drawing()}
            width={size().width}
            height={size().height}
            tabIndex={-1}
            ariaLabel={local().chart.name}
            onRender={({ svg }) => {
              svg.dataset["state"] = String(stateMark(state()));
              svg.dataset["localState"] = String(stateMark(local()));
              svg.dataset["sizeState"] = String(stateMark(size()));
            }}
          />
        </div>
        <Show when={local().bucket !== null}>
          <span
            class="chart-cursor"
            style={{
              left: `${chartMargin.left + ((local().bucket! + 0.5) / local().chart.buckets.length) * (size().width - chartMargin.left - chartMargin.right)}px`,
            }}
          />
        </Show>
      </div>
      <p class="chart-axis" aria-hidden="true">
        <span>{local().chart.buckets[0]?.title.replace(" · partial", "")}</span>
        <span>{local().chart.buckets.at(-1)?.title.replace(" · partial", "")}</span>
      </p>
      <p id="chart-instructions">
        Outlined bars are partial. Use ← →, Home or End to read; Enter to drill; Esc to clear.
      </p>
      <ChartReadout
        state={state}
        local={local}
        preserveFocus={preserveFocus}
        drill={() => drill()}
        clear={clear}
        highlight={highlight}
      />
      <span
        class="sr-only chart-spoken"
        aria-live="polite"
        aria-atomic="true"
        data-state={stateMark(state())}
        data-local-state={stateMark(local())}
      >
        {local().spoken}
      </span>
    </section>
  );
};
