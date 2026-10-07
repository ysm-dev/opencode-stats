import { render, cleanup } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import type { BrowserCopy } from "@opencode-stats/browser-copy";
import { inMemoryDashboardServer } from "@opencode-stats/browser-copy/testing";
import { inThreadEngine, manualClock } from "@opencode-stats/engine/testing";
import { Dashboard } from "../dashboard.tsx";
import { initialMedia, type MediaSize } from "../media-size.tsx";
import type { Accessor } from "solid-js";

export function dashboardFixture(
  copy: BrowserCopy,
  deliverAnswer: (deliver: () => void) => void = queueMicrotask,
  media: Accessor<MediaSize> = () => initialMedia,
  timeZone = "UTC",
) {
  const server = inMemoryDashboardServer(copy);
  const clock = manualClock();
  const engine = inThreadEngine(server.fetch, deliverAnswer, {
    ...clock,
    timeZone: () => timeZone,
  });
  const view = render(() => (
    <Dashboard client={engine.client} ready={Promise.resolve()} media={media} />
  ));
  const user = userEvent.setup();
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    cleanup();
    await engine.dispose();
    await server.dispose();
  };
  return { server, engine, clock, view, user, close, [Symbol.asyncDispose]: close };
}
