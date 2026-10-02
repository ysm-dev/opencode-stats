// PROTOTYPE: a ranked list with inline proportional bars. Rows are buttons that filter.
import { For, Show } from "solid-js";

export interface RankedItem {
  key: string;
  label: string;
  sub?: string;
  value: number;
  color?: string;
  selected?: boolean;
}

export interface RankedBarsProps {
  items: RankedItem[];
  format: (v: number) => string;
  extra?: (item: RankedItem) => string;
  onSelect?: (key: string) => void;
  limit?: number;
  class?: string;
}

export function RankedBars(props: RankedBarsProps) {
  const max = () => Math.max(...props.items.map((i) => i.value), 0) || 1;
  const shown = () => props.items.slice(0, props.limit ?? 8);
  return (
    <div class={`flex flex-col ${props.class ?? ""}`}>
      <For each={shown()}>
        {(item) => (
          <button
            type="button"
            class="ranked-row group relative flex h-7 items-center gap-2 rounded-[4px] px-1.5 text-left hover:bg-v2-overlay-simple-overlay-hover"
            classList={{ "bg-v2-background-bg-layer-02": !!item.selected }}
            onClick={() => props.onSelect?.(item.key)}
          >
            <span
              class="absolute inset-y-1 left-0 rounded-[3px] opacity-25"
              style={{
                width: `${(item.value / max()) * 100}%`,
                background: item.color ?? "var(--chart-1)",
              }}
            />
            <span class="relative min-w-0 flex-1 truncate">
              {item.label}
              <Show when={item.sub}>
                <span class="ml-1.5 text-v2-text-text-faint">{item.sub}</span>
              </Show>
            </span>
            <Show when={props.extra}>
              <span class="relative num text-[12px] text-v2-text-text-faint">
                {props.extra!(item)}
              </span>
            </Show>
            <span class="relative num w-16 text-right">{props.format(item.value)}</span>
          </button>
        )}
      </For>
      <Show when={props.items.length > (props.limit ?? 8)}>
        <div class="px-1.5 pt-1 text-[12px] text-v2-text-text-faint">
          {props.items.length - (props.limit ?? 8)} more
        </div>
      </Show>
    </div>
  );
}
