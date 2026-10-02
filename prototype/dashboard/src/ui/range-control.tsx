// PROTOTYPE: presets as a segmented control, with ‹ › shifting and the fixed range as a chip.
import { Icon } from "@opencode/ui/icon";
import { SegmentedControl, SegmentedControlItem } from "@opencode/ui/segmented-control";
import { For, Show } from "solid-js";
import { type Preset, PRESETS } from "../data/time";
import { rangeLabel } from "../format";
import { dash } from "../state";

export function ShiftButton(props: { dir: -1 | 1 }) {
  return (
    <button
      type="button"
      class="flex h-7 w-7 items-center justify-center rounded-[6px] text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover disabled:opacity-35"
      disabled={!dash.canShift(props.dir)}
      onClick={() => dash.shift(props.dir)}
      aria-label={props.dir < 0 ? "Previous range" : "Next range"}
      title={props.dir < 0 ? "Previous  [" : "Next  ]"}
    >
      <Icon
        name="chevron-down"
        size="small"
        style={{ transform: `rotate(${props.dir < 0 ? 90 : -90}deg)` }}
      />
    </button>
  );
}

export function RangeControl(props: { long?: boolean; class?: string }) {
  const preset = () => {
    const s = dash.spec();
    return s.kind === "preset" ? s.preset : null;
  };
  return (
    <div class={`flex items-center gap-1 ${props.class ?? ""}`}>
      <ShiftButton dir={-1} />
      <SegmentedControl
        aria-label="Time range"
        value={preset()}
        onChange={(v) => v && dash.setRange({ kind: "preset", preset: v as Preset })}
        style={{ width: "auto" }}
      >
        <For each={PRESETS}>
          {(p) => (
            <SegmentedControlItem value={p.id}>
              {props.long ? p.long : p.short}
            </SegmentedControlItem>
          )}
        </For>
      </SegmentedControl>
      <ShiftButton dir={1} />
      <Show when={!preset()}>
        <FixedChip />
      </Show>
    </div>
  );
}

/** A fixed range shows as a removable chip; removing it goes back to the 30-day preset. */
export function FixedChip() {
  return (
    <span class="ml-1 flex h-7 items-center gap-1 rounded-[6px] bg-v2-background-bg-layer-02 pl-2.5 pr-1 text-v2-text-text-base">
      <span class="num">{rangeLabel(dash.range())}</span>
      <button
        type="button"
        class="flex h-5 w-5 items-center justify-center rounded-[4px] text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover"
        onClick={() => dash.setRange({ kind: "preset", preset: "30d" })}
        aria-label="Back to last 30 days"
      >
        <Icon name="xmark-small" size="small" />
      </button>
    </span>
  );
}
