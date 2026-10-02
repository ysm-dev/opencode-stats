// PROTOTYPE C: one query, no pages. Keep all edits local to this throwaway variant.
import { Icon } from "@opencode/ui/icon";
import { Keybind } from "@opencode/ui/keybind";
import { createSignal, Show } from "solid-js";
import { rangeLabel } from "../../format";
import { dash } from "../../state";
import { FilterChips, FilterMenu } from "../../ui/filter-menu";
import { HotkeySheet, useBindings } from "../../ui/hotkeys";
import { FacetRail } from "./facets";
import { metrics, useQuery } from "./model";
import { Palette } from "./palette";
import { explorerBindings, QueryBar } from "./query-bar";
import { Workspace } from "./workspace";
import styles from "./c.css?inline";

export default function VariantC() {
  const { metric, cut, setMetric, setCut } = useQuery();
  const [help, setHelp] = createSignal(false);
  const [palette, setPalette] = createSignal(false);
  const [search, setSearch] = createSignal("");
  let facetInput!: HTMLInputElement;
  const bindings = explorerBindings({
    metric,
    cut,
    setMetric,
    setCut,
    togglePalette: () => setPalette((v) => !v),
    toggleHelp: () => setHelp((v) => !v),
    close: () => {
      setHelp(false);
      setPalette(false);
    },
    focusSearch: () => facetInput.focus(),
  });
  useBindings(bindings);
  return (
    <div class="c-root">
      <style>{styles}</style>
      <header class="c-brand-row">
        <div class="c-brand">
          <span class="c-logo">S</span>
          <span>opencode-stats</span>
          <span class="c-note">/</span>
          <span class="c-note">Explorer</span>
        </div>
        <div class="c-brand-actions">
          <span class="c-note">Local · read-only</span>
          <button type="button" class="c-command-trigger" onClick={() => setPalette(true)}>
            <Icon name="magnifying-glass" size="small" />
            <span>Commands</span>
            <Keybind keys={["⌘", "K"]} />
          </button>
          <button
            type="button"
            class="c-help-trigger"
            aria-label="Keyboard shortcuts"
            onClick={() => setHelp(true)}
          >
            ?
          </button>
        </div>
      </header>
      <div class="c-surface oc-surface">
        <header class="c-query-header">
          <QueryBar metric={metric()} cut={cut()} setMetric={setMetric} setCut={setCut} />
          <Show when={dash.activeFilters().length}>
            <div class="c-active-filters">
              <FilterChips />
              <Show when={dash.filters().tool?.length}>
                <span class="c-note">Tool filters apply to tool calls only.</span>
              </Show>
            </div>
          </Show>
        </header>
        <div
          class="c-body"
          onKeyDown={(e) => {
            if (e.key === "Escape") facetInput.blur();
          }}
        >
          <FacetRail
            metric={metric()}
            search={search()}
            setSearch={setSearch}
            inputRef={(el) => {
              facetInput = el;
            }}
          />
          <main
            class="c-main"
            aria-label={`${metrics.find((m) => m.id === metric())?.label} by ${cut()}`}
          >
            <div class="c-context">
              <span>
                {rangeLabel(dash.range())}
                <span class="c-note">
                  {" "}
                  · {dash.activeFilters().length ? "filtered activity" : "all activity"}
                </span>
              </span>
              <FilterMenu
                dims={["session"]}
                trigger={
                  <>
                    <Icon name="outline-sliders" size="small" /> Session filter
                  </>
                }
              />
            </div>
            <Workspace metric={metric()} cut={cut()} />
          </main>
        </div>
      </div>
      <HotkeySheet open={help()} onClose={() => setHelp(false)} bindings={bindings} />
      <Show when={palette()}>
        <Palette
          metric={metric()}
          setMetric={setMetric}
          setCut={setCut}
          onClose={() => setPalette(false)}
        />
      </Show>
    </div>
  );
}
