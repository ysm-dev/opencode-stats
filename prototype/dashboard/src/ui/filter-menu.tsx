// PROTOTYPE: pick filter values per dimension (any-of within a dimension, all-of across).
import { Icon } from "@opencode/ui/icon";
import { Popover } from "@opencode/ui/popover";
import { createMemo, createSignal, For, type JSX, Show } from "solid-js";
import { type Dimension, DIMENSIONS, dimensionValues, label } from "../data/query";
import { dash } from "../state";

export function FilterMenu(props: {
  dims?: Dimension[];
  trigger?: JSX.Element;
  triggerClass?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const dims = () => props.dims ?? DIMENSIONS.map((d) => d.id);
  const [internal, setInternal] = createSignal(false);
  const open = () => props.open ?? internal();
  const setOpen = (v: boolean) => {
    setInternal(v);
    props.onOpenChange?.(v);
  };
  const [dim, setDim] = createSignal<Dimension>(dims()[0]!);
  const [query, setQuery] = createSignal("");
  const values = createMemo(() => {
    const q = query().toLowerCase();
    return dimensionValues(dash.db(), dim())
      .filter(
        (v) => !q || v.label.toLowerCase().includes(q) || (v.sub ?? "").toLowerCase().includes(q),
      )
      .slice(0, 60);
  });
  const selected = (key: string) => (dash.filters()[dim()] ?? []).includes(key);
  return (
    <Popover
      open={open()}
      onOpenChange={setOpen}
      placement="bottom-start"
      triggerAs="button"
      triggerProps={{
        type: "button",
        class:
          props.triggerClass ??
          "flex h-7 items-center gap-1.5 rounded-[6px] px-2 text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover",
      }}
      trigger={
        props.trigger ?? (
          <>
            <Icon name="outline-sliders" size="small" /> Filter
          </>
        )
      }
      class="w-[460px] p-0"
    >
      <div class="flex h-[300px] text-[13px]">
        <div class="flex w-[130px] flex-col gap-0.5 border-r border-v2-border-border-base p-1.5">
          <For each={DIMENSIONS.filter((d) => dims().includes(d.id))}>
            {(d) => (
              <button
                type="button"
                class="flex h-7 items-center justify-between rounded-[4px] px-2 text-left hover:bg-v2-overlay-simple-overlay-hover"
                classList={{
                  "bg-v2-background-bg-layer-03 text-v2-text-text-base": dim() === d.id,
                  "text-v2-text-text-muted": dim() !== d.id,
                }}
                onClick={() => {
                  setDim(d.id);
                  setQuery("");
                }}
              >
                {d.label}
                <Show when={(dash.filters()[d.id] ?? []).length}>
                  <span class="num text-[11px] text-v2-text-text-accent">
                    {dash.filters()[d.id]!.length}
                  </span>
                </Show>
              </button>
            )}
          </For>
        </div>
        <div class="flex min-w-0 flex-1 flex-col">
          <input
            class="h-9 border-b border-v2-border-border-base bg-transparent px-3 outline-none placeholder:text-v2-text-text-faint"
            placeholder={`Search ${DIMENSIONS.find((d) => d.id === dim())!.plural.toLowerCase()}…`}
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
          <Show when={dim() === "tool"}>
            <div class="px-3 pt-2 text-[12px] text-v2-text-text-faint">
              Applies to tool calls only.
            </div>
          </Show>
          <div class="min-h-0 flex-1 overflow-y-auto p-1.5">
            <For each={values()}>
              {(v) => (
                <button
                  type="button"
                  class="flex h-7 w-full items-center gap-2 rounded-[4px] px-2 text-left hover:bg-v2-overlay-simple-overlay-hover"
                  onClick={() => dash.toggleFilter(dim(), v.key)}
                >
                  <span
                    class="flex h-3.5 w-3.5 flex-none items-center justify-center rounded-[3px] border border-v2-border-border-strong"
                    classList={{
                      "bg-v2-background-bg-accent border-transparent text-v2-text-text-contrast":
                        selected(v.key),
                    }}
                  >
                    <Show when={selected(v.key)}>
                      <Icon name="check" size="small" />
                    </Show>
                  </span>
                  <span class="min-w-0 flex-1 truncate">{v.label}</span>
                  <Show when={v.sub}>
                    <span class="truncate text-[12px] text-v2-text-text-faint">{v.sub}</span>
                  </Show>
                </button>
              )}
            </For>
          </div>
        </div>
      </div>
    </Popover>
  );
}

/** Active filters as removable chips. */
export function FilterChips(props: { class?: string }) {
  return (
    <div class={`flex flex-wrap items-center gap-1.5 ${props.class ?? ""}`}>
      <For each={dash.activeFilters()}>
        {([d, keys]) => (
          <span class="flex h-6 items-center gap-1 rounded-[6px] bg-v2-background-bg-layer-02 pl-2 pr-0.5 text-[12px]">
            <span class="text-v2-text-text-faint">{DIMENSIONS.find((x) => x.id === d)!.label}</span>
            <span class="max-w-[220px] truncate">
              {keys.map((k) => label(dash.db(), d, k)).join(", ")}
            </span>
            <button
              type="button"
              class="flex h-5 w-5 items-center justify-center rounded-[4px] text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover"
              onClick={() => dash.clearFilters(d)}
              aria-label={`Remove ${d} filter`}
            >
              <Icon name="xmark-small" size="small" />
            </button>
          </span>
        )}
      </For>
      <Show when={dash.activeFilters().length > 1}>
        <button
          type="button"
          class="h-6 px-1.5 text-[12px] text-v2-text-text-faint hover:text-v2-text-text-base"
          onClick={() => dash.clearFilters()}
        >
          Clear all
        </button>
      </Show>
    </div>
  );
}
