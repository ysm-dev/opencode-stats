import { createContext, type Accessor } from "solid-js";
import type { EngineState, createPageClient } from "@opencode-stats/engine";

export type CompletePage = Extract<EngineState, { screen: "dashboard" }>;
export const PageState = createContext<Accessor<CompletePage>>();
export const PageActions = createContext<ReturnType<typeof createPageClient>>();
