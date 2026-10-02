// PROTOTYPE: "Four dashboard variants, switchable via ?variant=, on one route, fake data only."
import { MetaProvider } from "@solidjs/meta";
import { ThemeProvider } from "@opencode/ui/theme/context";
import { type Component, createMemo, lazy } from "solid-js";
import { Dynamic } from "solid-js/web";
import { PrototypeBar } from "./prototype/switcher";
import { urlParam } from "./state";

const VARIANTS: { key: string; name: string; component: Component }[] = [
  { key: "A", name: "Pages", component: lazy(() => import("./variants/a-pages/index")) },
  { key: "B", name: "Report", component: lazy(() => import("./variants/b-report/index")) },
  { key: "C", name: "Explorer", component: lazy(() => import("./variants/c-explorer/index")) },
  { key: "D", name: "Calendar", component: lazy(() => import("./variants/d-calendar/index")) },
  { key: "E", name: "v1 candidate", component: lazy(() => import("./variants/e-v1/index")) },
];

export function App() {
  const [variant, setVariant] = urlParam<string>("variant", "A");
  const current = createMemo(() => VARIANTS.find((v) => v.key === variant()) ?? VARIANTS[0]!);
  return (
    <MetaProvider>
      <ThemeProvider defaultTheme="oc-2">
        <Dynamic component={current().component} />
        <PrototypeBar variants={VARIANTS} current={current().key} onChange={setVariant} />
      </ThemeProvider>
    </MetaProvider>
  );
}
