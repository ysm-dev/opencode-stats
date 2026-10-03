// PROTOTYPE chrome, not part of any design: flip variants with ← →, view them at real widths,
// fake a touchscreen or a first build, and swap single choices of the mobile-first variants.
import { useTheme } from "@opencode/ui/theme/context";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { clock, type ClockStyle, dates, type DateStyle, setClock, setDates } from "../format";
import {
  broadcast,
  build,
  type BuildState,
  dash,
  generatedIn,
  setBuild,
  setTouch,
  touch,
  urlParam,
} from "../state";
import {
  AXES,
  AXIS_KEYS,
  choice,
  clearOverrides,
  isPreset,
  override,
  PRESET_MIX,
  setOverride,
} from "../variants/m-mobile/mix";
import { FRAME_OPTIONS } from "./frames";

export interface VariantEntry {
  key: string;
  name: string;
}

export const [frame, setFrame] = urlParam<string>("frame", "");

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
  const [open, setOpen] = createSignal(innerWidth >= 700);
  const [mix, setMix] = createSignal(false);
  const index = () =>
    Math.max(
      0,
      props.variants.findIndex((v) => v.key === props.current),
    );
  const pick = (key: string) => {
    if (key !== props.current) clearOverrides();
    props.onChange(key);
  };
  const go = (d: number) => {
    const n = props.variants.length;
    pick(props.variants[(index() + d + n) % n]!.key);
  };
  const onKey = (e: KeyboardEvent) => {
    if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "ArrowLeft") go(-1);
    if (e.key === "ArrowRight") go(1);
  };
  onMount(() => window.addEventListener("keydown", onKey));
  onCleanup(() => window.removeEventListener("keydown", onKey));
  const preset = () => (isPreset(props.current) ? props.current : null);
  return (
    <>
      <Show when={mix() && preset()}>
        {(p) => (
          <div class="proto-mix" role="dialog" aria-label="Mix the mobile-first choices">
            <div class="proto-mix-head">
              <strong>Mix · preset {p()}</strong>
              <span>Dots mark choices that differ from {p()}</span>
            </div>
            <For each={AXIS_KEYS}>
              {(axis) => (
                <div class="proto-mix-row">
                  <span>{AXES[axis].label}</span>
                  <div>
                    <For each={AXES[axis].options}>
                      {([value, label]) => (
                        <button
                          type="button"
                          classList={{
                            "proto-on": choice(p(), axis) === value,
                            "proto-changed":
                              override(axis) === value && PRESET_MIX[p()][axis] !== value,
                          }}
                          onClick={() =>
                            setOverride(axis, value === PRESET_MIX[p()][axis] ? "" : value)
                          }
                        >
                          {label}
                        </button>
                      )}
                    </For>
                  </div>
                </div>
              )}
            </For>
            <div class="proto-mix-foot">
              <button type="button" onClick={clearOverrides}>
                Reset to {p()}
              </button>
              <button type="button" onClick={() => setMix(false)}>
                Close
              </button>
            </div>
          </div>
        )}
      </Show>
      <div
        class="proto-bar"
        classList={{ "proto-bar-closed": !open() }}
        role="toolbar"
        aria-label="Prototype controls"
      >
        <button
          type="button"
          class="proto-tag"
          onClick={() => setOpen((v) => !v)}
          title={open() ? "Fold the prototype bar" : "Unfold the prototype bar"}
        >
          PROTOTYPE {open() ? "–" : `· ${props.current} +`}
        </button>
        <Show when={open()}>
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
                onClick={() => pick(v.key)}
                title={v.name}
              >
                {v.key}
              </button>
            )}
          </For>
          <Show when={preset()}>
            <button
              type="button"
              class="proto-chip proto-mix-button"
              classList={{ "proto-dot-on": mix() }}
              onClick={() => setMix((v) => !v)}
            >
              Mix{AXIS_KEYS.some((a) => override(a)) ? " •" : ""}
            </button>
          </Show>
          <span class="proto-sep" />
          <Cycle<string>
            label="Width"
            value={frame()}
            onChange={setFrame}
            options={FRAME_OPTIONS}
          />
          <Cycle<"auto" | "on">
            label="Touch"
            value={touch()}
            onChange={setTouch}
            options={[
              ["auto", "auto"],
              ["on", "on"],
            ]}
          />
          <Cycle<BuildState>
            label="Status"
            value={build()}
            onChange={setBuild}
            options={[
              ["off", "up to date"],
              ["on", "build reading"],
              ["stopped", "build stopped"],
              ["stale", "sync stopped"],
              ["lost", "server lost"],
            ]}
          />
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
            onChange={(v) => {
              theme.setColorScheme(v);
              broadcast("theme", v);
            }}
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
        </Show>
      </div>
    </>
  );
}
