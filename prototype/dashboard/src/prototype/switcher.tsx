// PROTOTYPE chrome, not part of any design: flip variants with ← → and try date/clock formats.
import { useTheme } from "@opencode/ui/theme/context";
import { For, onCleanup, onMount } from "solid-js";
import { generatedIn, dash } from "../state";
import { clock, type ClockStyle, dates, type DateStyle, setClock, setDates } from "../format";

export interface VariantEntry {
  key: string;
  name: string;
}

function typing(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

function Cycle<T extends string>(props: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  const next = () => {
    const i = props.options.findIndex(([v]) => v === props.value);
    props.onChange(props.options[(i + 1) % props.options.length]![0]);
  };
  return (
    <button
      type="button"
      class="proto-chip"
      onClick={next}
      title={`Change ${props.label.toLowerCase()}`}
    >
      <span class="opacity-60">{props.label}</span>{" "}
      {props.options.find(([v]) => v === props.value)?.[1]}
    </button>
  );
}

export function PrototypeBar(props: {
  variants: VariantEntry[];
  current: string;
  onChange: (key: string) => void;
}) {
  const theme = useTheme();
  const index = () =>
    Math.max(
      0,
      props.variants.findIndex((v) => v.key === props.current),
    );
  const go = (d: number) => {
    const n = props.variants.length;
    props.onChange(props.variants[(index() + d + n) % n]!.key);
  };
  const onKey = (e: KeyboardEvent) => {
    if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "ArrowLeft") go(-1);
    if (e.key === "ArrowRight") go(1);
  };
  onMount(() => window.addEventListener("keydown", onKey));
  onCleanup(() => window.removeEventListener("keydown", onKey));
  return (
    <div class="proto-bar" role="toolbar" aria-label="Prototype controls">
      <span class="proto-tag">PROTOTYPE</span>
      <button
        type="button"
        class="proto-arrow"
        onClick={() => go(-1)}
        aria-label="Previous variant"
      >
        ←
      </button>
      <span class="proto-name">
        {props.variants[index()]?.key} · {props.variants[index()]?.name}
      </span>
      <button type="button" class="proto-arrow" onClick={() => go(1)} aria-label="Next variant">
        →
      </button>
      <span class="proto-sep" />
      <For each={props.variants}>
        {(v) => (
          <button
            type="button"
            class="proto-dot"
            classList={{ "proto-dot-on": v.key === props.current }}
            onClick={() => props.onChange(v.key)}
            title={v.name}
          >
            {v.key}
          </button>
        )}
      </For>
      <span class="proto-sep" />
      <Cycle<DateStyle>
        label="Dates"
        value={dates()}
        onChange={setDates}
        options={[
          ["locale", "browser"],
          ["month-day", "Oct 2"],
          ["day-month", "2 Oct"],
          ["iso", "10-02"],
        ]}
      />
      <Cycle<ClockStyle>
        label="Clock"
        value={clock()}
        onChange={setClock}
        options={[
          ["locale", "browser"],
          ["24h", "24h"],
          ["12h", "12h"],
        ]}
      />
      <Cycle<"system" | "light" | "dark">
        label="Theme"
        value={theme.colorScheme()}
        onChange={(v) => theme.setColorScheme(v)}
        options={[
          ["system", "system"],
          ["light", "light"],
          ["dark", "dark"],
        ]}
      />
      <Cycle<"on" | "off">
        label="Live writes"
        value={dash.live() ? "on" : "off"}
        onChange={(v) => dash.setLive(v === "on")}
        options={[
          ["on", "on"],
          ["off", "off"],
        ]}
      />
      <span class="proto-meta" title="Fake history generated in the browser">
        {dash.db().steps.length.toLocaleString("en-US")} fake steps · {generatedIn} ms
      </span>
    </div>
  );
}
