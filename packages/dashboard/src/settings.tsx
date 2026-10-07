import { Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import { Select } from "@opencode/ui/select";
import { Switch } from "@opencode/ui/switch";
import { Icon } from "@opencode/ui/icon";
import { useTheme } from "@opencode/ui/theme/context";
import type { ColorScheme } from "@opencode/ui/theme/context";
import { usePreferences } from "./preferences.tsx";
import { changes, changeDiagnostics, stateMark } from "./change-time.ts";

const label = (value: string) => value[0]!.toUpperCase() + value.slice(1);
const Sheet = (props: { close: () => void; opener: HTMLElement }) => {
  const theme = useTheme();
  const preferences = usePreferences();
  const appearance = createMemo(() => ({
    theme: theme.themeId(),
    scheme: theme.colorScheme(),
    shortcuts: preferences.singleKeyShortcuts(),
    storage: preferences.keepsPreferences(),
  }));
  let title!: HTMLHeadingElement;
  let sheet!: HTMLDivElement;
  const [menu, setMenu] = createSignal<"theme" | "scheme">();
  let keyboardFocus: HTMLElement | "navigation" | undefined;
  const pointer = () => {
    keyboardFocus = undefined;
  };
  const opened = (name: "theme" | "scheme", open: boolean) =>
    changes.local("settings-menu", () => setMenu(open ? name : undefined));
  // The published select defers its initial autofocus. It must not undo a key
  // that has already moved focus; genuine pointer input releases that target.
  const highlighted = () => {
    const target = document.activeElement;
    if (keyboardFocus === "navigation" && target instanceof HTMLElement) {
      keyboardFocus = target;
    } else
      queueMicrotask(() => {
        if (keyboardFocus instanceof HTMLElement) keyboardFocus.focus();
      });
  };
  const schemes: ColorScheme[] = ["system", "light", "dark"];
  const keydown = (event: KeyboardEvent) => {
    if (menu()) {
      keyboardFocus = "navigation";
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      props.close();
    }
    if (event.key !== "Tab") return;
    const stops = [...sheet.querySelectorAll<HTMLElement>('button, [role="button"], input')];
    const first = stops[0]!;
    const last = stops[stops.length - 1]!;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === title)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  onMount(() => {
    const shell = document.querySelector(".shell")!;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    shell.toggleAttribute("inert", true);
    shell.setAttribute("aria-hidden", "true");
    title.focus();
    const controller = new AbortController();
    const options = { capture: true, signal: controller.signal };
    document.addEventListener("keydown", keydown, options);
    document.addEventListener("pointerdown", pointer, options);
    document.addEventListener("pointermove", pointer, options);
    onCleanup(() => {
      controller.abort();
      document.body.style.overflow = overflow;
      shell.removeAttribute("inert");
      shell.removeAttribute("aria-hidden");
      const target =
        props.opener.isConnected && !props.opener.closest("[inert], [hidden]")
          ? props.opener
          : document.querySelector<HTMLElement>("main h1");
      target?.focus();
    });
  });
  return (
    <Portal>
      <div
        class="settings-backdrop"
        onClick={(event) => {
          if (event.target === event.currentTarget) props.close();
        }}
      >
        <div
          ref={(element) => {
            sheet = element;
          }}
          class="settings-sheet"
          data-preference-state={stateMark(appearance())}
          data-theme={appearance().theme}
          data-scheme={appearance().scheme}
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
        >
          <h2
            ref={(element) => {
              title = element;
            }}
            id="settings-title"
            tabIndex={-1}
          >
            Settings
          </h2>
          <div class="preference-row">
            <span id="scheme-label">Color scheme</span>
            <Select
              options={schemes}
              current={appearance().scheme}
              label={label}
              aria-labelledby="scheme-label"
              fitViewport
              onSelect={(value) => {
                if (value) changes.local("scheme", () => theme.setColorScheme(value));
              }}
              open={menu() === "scheme"}
              onOpenChange={(open) => opened("scheme", open)}
              onHighlight={highlighted}
              contentClass="settings-options"
            />
          </div>
          <div class="preference-row">
            <span id="theme-label">Theme</span>
            <Select
              options={theme.ids()}
              current={appearance().theme}
              label={theme.name}
              aria-labelledby="theme-label"
              fitViewport
              onSelect={(value) => {
                if (value) changes.local("theme", () => theme.setTheme(value));
              }}
              open={menu() === "theme"}
              onOpenChange={(open) => opened("theme", open)}
              onHighlight={highlighted}
              contentClass="settings-options"
            />
          </div>
          <Switch checked={appearance().shortcuts} onChange={preferences.setSingleKeyShortcuts}>
            Single-key shortcuts
          </Switch>
          <Show when={!appearance().storage}>
            <p class="storage-notice">Your browser keeps preferences only for this tab.</p>
          </Show>
          <button
            class="settings-diagnostics"
            type="button"
            tabIndex={0}
            onClick={() =>
              void navigator.clipboard.writeText(JSON.stringify({ changes: changeDiagnostics() }))
            }
          >
            Copy diagnostics
          </button>
          <button class="settings-done" type="button" tabIndex={0} onClick={props.close}>
            Done
          </button>
        </div>
      </div>
    </Portal>
  );
};

export const Settings = () => {
  const [open, setOpen] = createSignal(false);
  let opener!: HTMLButtonElement;
  return (
    <>
      <button
        ref={(element) => {
          opener = element;
        }}
        type="button"
        tabIndex={0}
        class="settings-gear"
        aria-label="Settings"
        onClick={() => changes.local("settings", () => setOpen(true))}
      >
        <Icon name="settings-gear" />
      </button>
      <Show when={open()}>
        <Sheet opener={opener} close={() => changes.local("settings", () => setOpen(false))} />
      </Show>
    </>
  );
};
