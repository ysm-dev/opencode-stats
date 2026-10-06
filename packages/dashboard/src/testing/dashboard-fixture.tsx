import { render, cleanup } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import type { BrowserCopy } from "@opencode-stats/browser-copy";
import { inMemoryDashboardServer } from "@opencode-stats/browser-copy/testing";
import { inThreadEngine, manualClock } from "@opencode-stats/engine/testing";
import { Dashboard } from "../dashboard.tsx";

export function dashboardFixture(
  copy: BrowserCopy,
  deliverAnswer: (deliver: () => void) => void = queueMicrotask,
) {
  const server = inMemoryDashboardServer(copy);
  const clock = manualClock();
  const engine = inThreadEngine(server.fetch, deliverAnswer, clock);
  const view = render(() => <Dashboard client={engine.client} ready={Promise.resolve()} />);
  const user = userEvent.setup();
  const close = async () => {
    cleanup();
    await engine.dispose();
    await server.dispose();
  };
  return { server, engine, clock, view, user, close, [Symbol.asyncDispose]: close };
}
