import { createContext, useContext } from "solid-js";
import type { Mix } from "./mix";
import type { ControlStyle } from "./overlay";

export interface MobileContext {
  mix: () => Mix;
  /** How a shell fits segmented controls into a narrow column. */
  controls: () => ControlStyle;
}

export const MobileCtx = createContext<MobileContext>();

export function useMobile(): MobileContext {
  const ctx = useContext(MobileCtx);
  if (!ctx) throw new Error("useMobile outside the mobile-first variant");
  return ctx;
}
