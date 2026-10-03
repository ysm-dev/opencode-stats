// PROTOTYPE: "Three mobile-first versions of variant E (F, G, H), switchable via ?variant=, on
// the same route; the bar's Mix panel swaps any single choice and its Width frames show them at
// 360-1280px." Answers https://github.com/ysm-dev/opencode-stats/issues/23.
import { createMemo, Match, Switch } from "solid-js";
import aStyles from "../a-pages/a.css?inline";
import bStyles from "../b-report/report.css?inline";
import cStyles from "../c-explorer/c.css?inline";
import dStyles from "../d-calendar/calendar.css?inline";
import graphStyles from "../d-calendar/graph.css?inline";
import eStyles from "../e-v1/e.css?inline";
import { MobileCtx } from "./context";
import { AXIS_KEYS, choice, type Mix, type Preset } from "./mix";
import { DrawerShell, PickerShell, TabsShell } from "./shell";
import styles from "./m.css?inline";

const CONTROLS = { picker: "select", tabs: "chips", drawer: "wrap" } as const;

export function Mobile(props: { preset: Preset }) {
  const mix = createMemo(
    () => Object.fromEntries(AXIS_KEYS.map((axis) => [axis, choice(props.preset, axis)])) as Mix,
  );
  return (
    <MobileCtx.Provider value={{ mix, controls: () => CONTROLS[mix().shell] }}>
      <style>
        {aStyles}
        {bStyles}
        {cStyles}
        {dStyles}
        {graphStyles}
        {eStyles}
        {styles}
      </style>
      <Switch>
        <Match when={mix().shell === "picker"}>
          <PickerShell />
        </Match>
        <Match when={mix().shell === "tabs"}>
          <TabsShell />
        </Match>
        <Match when={mix().shell === "drawer"}>
          <DrawerShell />
        </Match>
      </Switch>
    </MobileCtx.Provider>
  );
}
