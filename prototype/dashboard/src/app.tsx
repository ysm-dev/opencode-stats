// PROTOTYPE: "Dashboard variants, switchable via ?variant=, on one route, fake data only."
// A–E answer issue #14 (pages, charts, hotkeys); F–H answer issue #23 (phone width up).
import { MetaProvider } from "@solidjs/meta";
import { ThemeProvider, useTheme } from "@opencode/ui/theme/context";
import { type Component, createEffect, createMemo, lazy, onCleanup, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { Frames } from "./prototype/frames";
import { frame, PrototypeBar } from "./prototype/switcher";
import { applyQuietly, dash, embedded, registerSetter, setParam, touch, urlParam } from "./state";
import type { Preset } from "./variants/m-mobile/mix";

const mobile = (preset: Preset) =>
  lazy(() =>
    import("./variants/m-mobile/index").then((m) => ({
      default: () => <m.Mobile preset={preset} />,
    })),
  );

const VARIANTS: { key: string; name: string; component: Component }[] = [
  { key: "A", name: "Pages", component: lazy(() => import("./variants/a-pages/index")) },
  { key: "B", name: "Report", component: lazy(() => import("./variants/b-report/index")) },
  { key: "C", name: "Explorer", component: lazy(() => import("./variants/c-explorer/index")) },
  { key: "D", name: "Calendar", component: lazy(() => import("./variants/d-calendar/index")) },
  { key: "E", name: "v1 candidate", component: lazy(() => import("./variants/e-v1/index")) },
  { key: "F", name: "Mobile · Picker", component: mobile("F") },
  { key: "G", name: "Mobile · Tabs", component: mobile("G") },
  { key: "H", name: "Mobile · Drawer", component: mobile("H") },
];

/** Inside a frame: take settings from the bar's page and mirror the other frames' state. */
function Bridge() {
  const theme = useTheme();
  registerSetter("theme", (v) => theme.setColorScheme(v as "system" | "light" | "dark"));
  createEffect(() => {
    document.documentElement.dataset.touch = touch();
  });
  if (embedded) {
    const onMessage = (
      e: MessageEvent<{ type?: string; name?: string; value?: string; search?: string }>,
    ) => {
      if (e.origin !== location.origin) return;
      if (e.data?.type === "proto:set" && e.data.name)
        applyQuietly(() => setParam(e.data.name!, e.data.value ?? ""));
      if (e.data?.type === "proto:sync" && e.data.search) dash.applySearch(e.data.search);
    };
    addEventListener("message", onMessage);
    onCleanup(() => removeEventListener("message", onMessage));
  }
  return null;
}

export function App() {
  const [variant, setVariant] = urlParam<string>("variant", "A");
  const current = createMemo(() => VARIANTS.find((v) => v.key === variant()) ?? VARIANTS[0]!);
  return (
    <MetaProvider>
      <ThemeProvider defaultTheme="oc-2">
        <Bridge />
        <Show when={!embedded && frame()} fallback={<Dynamic component={current().component} />}>
          <Frames frame={frame()} />
        </Show>
        <Show when={!embedded}>
          <PrototypeBar variants={VARIANTS} current={current().key} onChange={setVariant} />
        </Show>
      </ThemeProvider>
    </MetaProvider>
  );
}
