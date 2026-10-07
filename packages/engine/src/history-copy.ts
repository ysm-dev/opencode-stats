import type { BrowserCopy } from "@opencode-stats/browser-copy";
import type { EngineClock } from "./clock.ts";
import { createFacts } from "./tokens.ts";

// The visible copy stays usable while a replacement is being applied or has
// not covered today. Only this module chooses which generation readers see.
export function createHistoryCopy(clock: EngineClock) {
  let active = createFacts(clock);
  let incoming: ReturnType<typeof createFacts> | undefined;
  let ready = false;
  const refresh = () => {
    if (incoming?.current() && incoming.coversToday()) {
      active = incoming;
      incoming = undefined;
    }
    if (active.current()) ready ||= active.coversToday();
  };
  const apply = (copy: BrowserCopy, signal: AbortSignal, addWork: (work: number) => void) => {
    if (
      copy.kind === "whole" &&
      active.current() &&
      copy.generation !== active.current()!.generation
    )
      incoming = createFacts(clock);
    return (incoming ?? active).apply(copy, signal, addWork);
  };
  return {
    apply,
    refresh,
    received: () => (incoming ?? active).current(),
    canPaint: () => !incoming && ready,
    view: {
      current: () => active.current(),
      ready: () => ready,
      query: (...args: Parameters<typeof active.query>) => active.query(...args),
      filterState: (...args: Parameters<typeof active.filterState>) => active.filterState(...args),
      filterLabel: (...args: Parameters<typeof active.filterLabel>) => active.filterLabel(...args),
      history: (...args: Parameters<typeof active.history>) => active.history(...args),
    },
  };
}
