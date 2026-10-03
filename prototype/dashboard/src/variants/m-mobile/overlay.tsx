// PROTOTYPE: menus, bottom sheets and the drawer. All appear in one frame, with no slide or fade,
// in keeping with "every change appears whole".
import { Icon } from "@opencode/ui/icon";
import { SegmentedControl, SegmentedControlItem } from "@opencode/ui/segmented-control";
import {
  type ComponentProps,
  createSignal,
  For,
  type JSX,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { narrow } from "./media";

export type IconName = ComponentProps<typeof Icon>["name"];

function useDismiss(
  open: () => boolean,
  close: () => void,
  inside?: () => HTMLElement | undefined,
) {
  const key = (e: KeyboardEvent) => {
    if (open() && e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  };
  const down = (e: PointerEvent) => {
    const el = inside?.();
    if (open() && el && !el.contains(e.target as Node)) close();
  };
  onMount(() => {
    document.addEventListener("keydown", key, true);
    if (inside) document.addEventListener("pointerdown", down, true);
  });
  onCleanup(() => {
    document.removeEventListener("keydown", key, true);
    document.removeEventListener("pointerdown", down, true);
  });
}

export interface MenuOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
  hint?: string;
}

/** A button that opens a list below it: the page picker, the range menu, metric selects. */
export function Menu<T extends string>(props: {
  label: JSX.Element;
  ariaLabel: string;
  value: T | null;
  options: MenuOption<T>[];
  onSelect: (value: T) => void;
  class?: string;
  align?: "start" | "end";
}) {
  const [open, setOpen] = createSignal(false);
  let root: HTMLDivElement | undefined;
  useDismiss(
    open,
    () => setOpen(false),
    () => root,
  );
  return (
    <div class="m-menu" ref={(el) => (root = el)}>
      <button
        type="button"
        class={`m-menu-trigger ${props.class ?? ""}`}
        aria-haspopup="listbox"
        aria-expanded={open()}
        aria-label={props.ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        {props.label}
        <Icon name="chevron-down" size="small" />
      </button>
      <Show when={open()}>
        <div class="m-menu-list oc-surface" role="listbox" data-align={props.align ?? "start"}>
          <For each={props.options}>
            {(o) => (
              <button
                type="button"
                role="option"
                class="m-menu-item"
                aria-selected={o.value === props.value}
                onClick={() => {
                  props.onSelect(o.value);
                  setOpen(false);
                }}
              >
                <Show when={o.icon}>
                  <Icon name={o.icon!} size="small" />
                </Show>
                <span class="flex-1">{o.label}</span>
                <Show when={o.hint}>
                  <kbd>{o.hint}</kbd>
                </Show>
                <span class="m-menu-check">
                  <Show when={o.value === props.value}>
                    <Icon name="check-small" size="small" />
                  </Show>
                </span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

/** A panel from the bottom edge on phones; a centred panel from 600px. No animation. */
export function Sheet(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: JSX.Element;
  actions?: JSX.Element;
}) {
  useDismiss(
    () => props.open,
    () => props.onClose(),
  );
  return (
    <Show when={props.open}>
      <div class="m-scrim m-scrim-bottom" onClick={() => props.onClose()}>
        <div
          class="m-sheet"
          role="dialog"
          aria-modal="true"
          aria-label={props.title}
          onClick={(e) => e.stopPropagation()}
        >
          <div class="m-sheet-handle" aria-hidden="true" />
          <header class="m-sheet-head">
            <h2>{props.title}</h2>
            {props.actions}
            <button
              type="button"
              class="m-sheet-done"
              ref={(el) => queueMicrotask(() => el.focus({ preventScroll: true }))}
              onClick={() => props.onClose()}
            >
              Done
            </button>
          </header>
          <div class="m-sheet-body">{props.children}</div>
        </div>
      </div>
    </Show>
  );
}

/** The drawer variant's sidebar, over a scrim from the left edge. No animation. */
export function Drawer(props: { open: boolean; onClose: () => void; children: JSX.Element }) {
  useDismiss(
    () => props.open,
    () => props.onClose(),
  );
  return (
    <Show when={props.open}>
      <div class="m-scrim m-scrim-left" onClick={() => props.onClose()}>
        <div
          class="m-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Pages and filters"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            class="m-icon-button m-drawer-close"
            aria-label="Close pages and filters"
            ref={(el) => queueMicrotask(() => el.focus({ preventScroll: true }))}
            onClick={() => props.onClose()}
          >
            <Icon name="close" size="small" />
          </button>
          {props.children}
        </div>
      </div>
    </Show>
  );
}

export type ControlStyle = "select" | "chips" | "wrap";

/**
 * A choice among a few values. Wide: OpenCode's segmented control, as in variant E. Narrow: the
 * shell's style, either a select, a row of segments that scrolls sideways, or segments that wrap.
 */
export function Choice<T extends string>(props: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (value: T) => void;
  style: ControlStyle;
}) {
  const current = () => props.options.find(([v]) => v === props.value)?.[1] ?? "";
  return (
    <Show
      when={narrow() && props.style === "select"}
      fallback={
        <div
          class="m-seg"
          classList={{
            "m-seg-scroll": narrow() && props.style === "chips",
            "m-seg-wrap": narrow() && props.style === "wrap",
          }}
        >
          <SegmentedControl
            aria-label={props.label}
            value={props.value}
            onChange={(v) => v && props.onChange(v as T)}
          >
            <For each={props.options}>
              {([value, title]) => (
                <SegmentedControlItem value={value}>{title}</SegmentedControlItem>
              )}
            </For>
          </SegmentedControl>
        </div>
      }
    >
      <Menu
        ariaLabel={props.label}
        label={<span>{current()}</span>}
        value={props.value}
        options={props.options.map(([value, label]) => ({ value, label }))}
        onSelect={props.onChange}
        class="m-select"
      />
    </Show>
  );
}
