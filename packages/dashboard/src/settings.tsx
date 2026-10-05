import { Show, createSignal, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import { Select } from "@opencode/ui/select";
import { Switch } from "@opencode/ui/switch";
import { Icon } from "@opencode/ui/icon";
import { useTheme } from "@opencode/ui/theme/context";
import type { ColorScheme } from "@opencode/ui/theme/context";
import { usePreferences } from "./preferences.tsx";

const label = (value: string) => value[0]!.toUpperCase() + value.slice(1);
const Sheet = (props: { close: () => void; opener: HTMLElement }) => {
  const theme = useTheme();
  const preferences = usePreferences();
  let title!: HTMLHeadingElement;
  let sheet!: HTMLDivElement;
  let nested = false;
  let keyboardFocus: HTMLElement | "navigation" | undefined;
  const pointer = () => {
    keyboardFocus = undefined;
  };
  const opened = (open: boolean) => {
    nested = open;
  };
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
    if (nested) {
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
              current={theme.colorScheme()}
              label={label}
              aria-labelledby="scheme-label"
              fitViewport
              onSelect={(value) => {
                if (value) theme.setColorScheme(value);
              }}
              onOpenChange={opened}
              onHighlight={highlighted}
              contentClass="settings-options"
            />
          </div>
          <div class="preference-row">
            <span id="theme-label">Theme</span>
            <Select
              options={theme.ids()}
              current={theme.themeId()}
              label={theme.name}
              aria-labelledby="theme-label"
              fitViewport
              onSelect={(value) => {
                if (value) theme.setTheme(value);
              }}
              onOpenChange={opened}
              onHighlight={highlighted}
              contentClass="settings-options"
            />
          </div>
          <Switch
            checked={preferences.singleKeyShortcuts()}
            onChange={preferences.setSingleKeyShortcuts}
          >
            Single-key shortcuts
          </Switch>
          <Show when={!preferences.keepsPreferences()}>
            <p class="storage-notice">Your browser keeps preferences only for this tab.</p>
          </Show>
          <button class="settings-done" type="button" onClick={props.close}>
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
        class="settings-gear"
        aria-label="Settings"
        onClick={() => setOpen(true)}
      >
        <Icon name="settings-gear" />
      </button>
      <Show when={open()}>
        <Sheet opener={opener} close={() => setOpen(false)} />
      </Show>
    </>
  );
};
