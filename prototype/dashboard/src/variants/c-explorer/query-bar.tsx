import { Icon } from "@opencode/ui/icon";
import { Select } from "@opencode/ui/select";
import { Show } from "solid-js";
import type { Metric } from "../../data/series";
import { PRESETS } from "../../data/time";
import { dash } from "../../state";
import type { Binding } from "../../ui/hotkeys";
import { FixedChip, ShiftButton } from "../../ui/range-control";
import { cutsFor, cycle, dimensions, metrics, type Cut } from "./model";

export function QueryBar(props: {
  metric: Metric;
  cut: Cut;
  setMetric: (m: Metric) => void;
  setCut: (c: Cut) => void;
}) {
  return (
    <div class="c-query">
      <Icon name="window-analytics" size="normal" />
      <Select
        aria-label="Metric"
        class="c-query-picker c-metric-picker"
        options={metrics}
        current={metrics.find((m) => m.id === props.metric)}
        value={(m) => m.id}
        label={(m) => m.label}
        onSelect={(m) => m && props.setMetric(m.id)}
      />
      <span class="c-query-word">by</span>
      <Select
        aria-label="Dimension"
        class="c-query-picker"
        options={cutsFor(props.metric)}
        current={dimensions.find((d) => d.id === props.cut)}
        value={(d) => d.id}
        label={(d) => d.label}
        onSelect={(d) => d && props.setCut(d.id)}
      />
      <span class="c-query-word">·</span>
      <Select
        aria-label="Range preset"
        class="c-query-picker"
        options={PRESETS}
        current={PRESETS.find((p) => p.id === presetId())}
        value={(p) => p.id}
        label={(p) => p.long}
        placeholder="Presets"
        onSelect={(p) => p && dash.setRange({ kind: "preset", preset: p.id })}
      />
      <Show when={dash.spec().kind === "fixed"}>
        <FixedChip />
      </Show>
      <div class="c-shift">
        <ShiftButton dir={-1} />
        <ShiftButton dir={1} />
      </div>
      <span class="c-query-caption">Pick a metric. Explore any cut.</span>
    </div>
  );
}

interface ExplorerActions {
  metric: () => Metric;
  cut: () => Cut;
  setMetric: (m: Metric) => void;
  setCut: (c: Cut) => void;
  togglePalette: () => void;
  toggleHelp: () => void;
  close: () => void;
  focusSearch: () => void;
}

export function explorerBindings(actions: ExplorerActions): Binding[] {
  return [
    { hotkey: "Mod+K", label: "Command palette", group: "Explorer", run: actions.togglePalette },
    {
      hotkey: "M",
      label: "Next metric",
      group: "Explorer",
      run: () =>
        actions.setMetric(
          cycle(
            metrics.map((m) => m.id),
            actions.metric(),
            1,
          ),
        ),
    },
    {
      hotkey: "Shift+M",
      label: "Previous metric",
      group: "Explorer",
      run: () =>
        actions.setMetric(
          cycle(
            metrics.map((m) => m.id),
            actions.metric(),
            -1,
          ),
        ),
    },
    {
      hotkey: "D",
      label: "Next dimension",
      group: "Explorer",
      run: () =>
        actions.setCut(
          cycle(
            cutsFor(actions.metric()).map((d) => d.id),
            actions.cut(),
            1,
          ),
        ),
    },
    {
      hotkey: "Shift+D",
      label: "Previous dimension",
      group: "Explorer",
      run: () =>
        actions.setCut(
          cycle(
            cutsFor(actions.metric()).map((d) => d.id),
            actions.cut(),
            -1,
          ),
        ),
    },
    { hotkey: "/", label: "Search facet values", group: "Explorer", run: actions.focusSearch },
    ...PRESETS.map((p, i) => ({
      hotkey: String(i + 1),
      label: p.long,
      group: "Time range",
      run: () => dash.setRange({ kind: "preset", preset: p.id }),
    })),
    { hotkey: "[", label: "Shift previous", group: "Time range", run: () => dash.shift(-1) },
    { hotkey: "]", label: "Shift next", group: "Time range", run: () => dash.shift(1) },
    { hotkey: "?", label: "Keyboard shortcuts", group: "Help", run: actions.toggleHelp },
    { hotkey: "Escape", label: "Close", group: "Help", run: actions.close },
  ];
}

function presetId() {
  const spec = dash.spec();
  return spec.kind === "preset" ? spec.preset : null;
}
