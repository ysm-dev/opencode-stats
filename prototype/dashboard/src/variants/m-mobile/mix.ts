// PROTOTYPE: the mobile-first variants F, G and H are one dashboard with six independent choices.
// Each preset is a coherent stance; the bar's Mix panel overrides any single choice (?m.<axis>=).
import { urlParam } from "../../state";

export const AXES = {
  shell: {
    label: "Pages, range, filters",
    options: [
      ["picker", "Picker"],
      ["tabs", "Tabs"],
      ["drawer", "Drawer"],
    ],
  },
  numbers: {
    label: "Headline numbers",
    options: [
      ["grid", "2 columns"],
      ["list", "List"],
      ["lead", "4 + 6"],
    ],
  },
  chart: {
    label: "Time charts",
    options: [
      ["fit", "Fit"],
      ["scroll", "Scroll"],
      ["coarse", "Coarser"],
    ],
  },
  graph: {
    label: "Contribution graph",
    options: [
      ["scroll", "Scroll"],
      ["months", "Months"],
      ["fit", "Fit"],
    ],
  },
  table: {
    label: "Tables",
    options: [
      ["scroll", "Scroll"],
      ["cards", "Cards"],
      ["pivot", "One column"],
    ],
  },
  rhythm: {
    label: "Weekday × hour",
    options: [
      ["fit", "Fit"],
      ["turn", "Turned"],
    ],
  },
} as const;

export type Axis = keyof typeof AXES;
export type Mix = { [K in Axis]: (typeof AXES)[K]["options"][number][0] };
export type Preset = "F" | "G" | "H";
export const AXIS_KEYS = Object.keys(AXES) as Axis[];

export const PRESET_MIX: Record<Preset, Mix> = {
  F: {
    shell: "picker",
    numbers: "grid",
    chart: "fit",
    graph: "scroll",
    table: "scroll",
    rhythm: "fit",
  },
  G: {
    shell: "tabs",
    numbers: "list",
    chart: "scroll",
    graph: "months",
    table: "cards",
    rhythm: "turn",
  },
  H: {
    shell: "drawer",
    numbers: "lead",
    chart: "coarse",
    graph: "fit",
    table: "pivot",
    rhythm: "fit",
  },
};

export const isPreset = (key: string): key is Preset => key in PRESET_MIX;

const overrides = Object.fromEntries(
  AXIS_KEYS.map((axis) => [axis, urlParam<string>(`m.${axis}`, "")]),
) as Record<Axis, [() => string, (v: string) => void]>;

export function override(axis: Axis): string {
  return overrides[axis][0]();
}

export function setOverride(axis: Axis, value: string): void {
  overrides[axis][1](value);
}

export function clearOverrides(): void {
  for (const axis of AXIS_KEYS) overrides[axis][1]("");
}

/** The effective choice for one axis: the URL override, else the preset's. */
export function choice<K extends Axis>(preset: Preset, axis: K): Mix[K] {
  const valid = AXES[axis].options.some(([v]) => v === override(axis));
  return (valid ? override(axis) : PRESET_MIX[preset][axis]) as Mix[K];
}
