// PROTOTYPE: one list of bindings drives both TanStack Hotkeys and the "?" cheat sheet.
import { Keybind } from "@opencode/ui/keybind";
import { createHotkey, createHotkeySequence } from "@tanstack/solid-hotkeys";
import { For, Show } from "solid-js";

export interface Binding {
  /** A single key or chord such as "?", "[", "Escape", "Mod+K". */
  hotkey?: string;
  /** A sequence such as ["G", "M"]. */
  sequence?: string[];
  label: string;
  group: string;
  run: () => void;
}

export function useBindings(bindings: Binding[]): void {
  for (const b of bindings) {
    const options = {
      ignoreInputs: true,
      preventDefault: true,
      conflictBehavior: "allow" as const,
    };
    if (b.sequence) createHotkeySequence(b.sequence as never, () => b.run(), options as never);
    else if (b.hotkey) createHotkey(b.hotkey as never, () => b.run(), options as never);
  }
}

const display = (b: Binding): string[] =>
  b.sequence
    ? b.sequence.map((k) => k.toLowerCase())
    : (b.hotkey ?? "").split("+").map((k) => (k === "Mod" ? "⌘" : k === "Escape" ? "esc" : k));

export function HotkeySheet(props: { open: boolean; onClose: () => void; bindings: Binding[] }) {
  const groups = () => [...new Set(props.bindings.map((b) => b.group))];
  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-[900] flex items-start justify-center bg-v2-overlay-simple-overlay-scrim pt-[12vh]"
        onClick={props.onClose}
      >
        <div
          class="oc-surface w-[560px] max-w-[92vw] p-5"
          style={{ "box-shadow": "var(--v2-elevation-floating)" }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Keyboard shortcuts"
        >
          <div class="mb-3 flex items-center justify-between">
            <span class="text-[14px] font-medium">Keyboard shortcuts</span>
            <Keybind keys={["esc"]} />
          </div>
          <div class="grid grid-cols-2 gap-x-8 gap-y-4">
            <For each={groups()}>
              {(g) => (
                <div>
                  <div class="mb-1 text-[12px] text-v2-text-text-faint">{g}</div>
                  <For each={props.bindings.filter((b) => b.group === g)}>
                    {(b) => (
                      <div class="flex h-7 items-center justify-between gap-3">
                        <span class="text-v2-text-text-muted">{b.label}</span>
                        <Keybind keys={display(b)} />
                      </div>
                    )}
                  </For>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </Show>
  );
}
