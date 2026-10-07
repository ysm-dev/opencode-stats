import { Show, createSignal, onCleanup, onMount, useContext } from "solid-js";
import { render } from "solid-js/web";
import { MetaProvider } from "@solidjs/meta";
import { Select } from "@opencode/ui/select";
import { PreferenceProvider } from "./preferences.tsx";
import { Settings } from "./settings.tsx";
import { Filters, FilterChips } from "./filters.tsx";
import { PageState, PageActions } from "./page-context.ts";
import { preserveFilterFocus } from "./filter-focus.ts";
import { changes, stateMark } from "./change-time.ts";
import { PreviousNumber, StepHeadlines } from "./step-headlines.tsx";
import { UsageChart } from "./usage-chart.tsx";
import { MediaSizeProvider, type MediaSize } from "./media-size.tsx";
import type { Accessor } from "solid-js";
import { stopReason } from "@opencode-stats/browser-copy/api";
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/solid-router";
import {
  presets,
  presetLabels,
  type EngineState,
  type EngineAction,
  type ChangeTime,
  type createPageClient,
} from "@opencode-stats/engine";

type PageClient = ReturnType<typeof createPageClient>;
const focusRange = () =>
  document.querySelector<HTMLElement>('.range-control [data-component="select-v2"]')!.focus();

const RangeControls = () => {
  const state = useContext(PageState)!;
  const client = useContext(PageActions)!;
  const [menuOpen, setMenuOpen] = createSignal(false);
  const selectPreset = (preset: (typeof presets)[number] | null) => {
    if (preset) void client.request({ kind: "preset", preset });
  };
  const nextRange = () => {
    const started = performance.now();
    focusRange();
    void client.request({ kind: "shift", direction: 1 }, started);
  };
  const removeFixed = () => {
    const started = performance.now();
    focusRange();
    void client.request({ kind: "remove-fixed", preset: state().range.preset }, started);
  };
  return (
    <div
      class="range-control"
      aria-label="Time range"
      role="group"
      data-state={stateMark(state())}
      data-range={state().address}
    >
      <button
        type="button"
        aria-label="Previous range"
        disabled={!state().range.canShiftBack}
        onClick={() => void client.request({ kind: "shift", direction: -1 })}
      >
        ‹
      </button>
      <span class="sr-only" id="time-range-label">
        Time range
      </span>
      <Select
        options={[...presets]}
        current={state().range.preset}
        label={(preset) => presetLabels[preset]}
        aria-labelledby="time-range-label"
        fitViewport
        onSelect={selectPreset}
        contentClass="settings-options range-options"
        open={menuOpen()}
        onOpenChange={(open) => changes.local("range-menu", () => setMenuOpen(open))}
      />
      <button
        type="button"
        aria-label="Next range"
        disabled={!state().range.canShiftForward}
        onClick={nextRange}
      >
        ›
      </button>
      <Show when={state().range.fixedLabel}>
        <button
          class="fixed-range"
          type="button"
          aria-label={`Remove fixed range · ${state().range.fixedLabel}`}
          onClick={removeFixed}
        >
          {state().range.fixedLabel} ×
        </button>
      </Show>
    </div>
  );
};

const Overview = () => {
  const state = useContext(PageState)!;
  return (
    <>
      <header data-state={stateMark(state())}>
        <h1 tabIndex={-1}>Overview</h1>
        <RangeControls />
        <FilterChips />
        <UpdateStatus />
      </header>
      <p data-state={stateMark(state())}>{state().summary}</p>
      <section
        aria-labelledby="tokens"
        data-state={stateMark(state())}
        data-generation={state().generation}
        data-revision={state().revision}
        data-range={state().address}
      >
        <h2 id="tokens">Tokens</h2>
        <p class="headline-number">{state().tokens.total.toLocaleString("en-US")}</p>
        <PreviousNumber metric="tokens" />
      </section>
      <section
        aria-labelledby="sessions"
        data-state={stateMark(state())}
        data-generation={state().generation}
        data-revision={state().revision}
        data-range={state().address}
      >
        <h2 id="sessions">Sessions</h2>
        <p class="headline-number">{state().sessions.total.toLocaleString("en-US")}</p>
        <p>+ {state().sessions.subagents.toLocaleString("en-US")} subagent sessions</p>
        <PreviousNumber metric="sessions" />
      </section>
      <StepHeadlines />
      <UsageChart />
    </>
  );
};

const LiveStatus = () => {
  const state = useContext(PageState)!;
  const client = useContext(PageActions)!;
  return (
    <button
      type="button"
      class="live-status"
      data-state={stateMark(state())}
      data-generation={state().generation}
      data-revision={state().revision}
      data-updating={!state().paused && state().liveLabel !== "Not updating"}
      data-sync-reason={state().stop?.reason ?? ""}
      aria-label={
        state().paused
          ? "Paused · Resume live updates"
          : `${state().liveLabel} · Pause live updates`
      }
      onClick={() => client.signal({ kind: "paused", paused: !state().paused })}
    >
      <span class="live-dot" aria-hidden="true" />
      {state().liveLabel}
    </button>
  );
};

const UpdateStatus = () => {
  const state = useContext(PageState)!;
  const client = useContext(PageActions)!;
  const resume = () => {
    const started = performance.now();
    document.querySelector<HTMLButtonElement>(".live-status")!.focus();
    client.signal({ kind: "paused", paused: false }, started);
  };
  return (
    <>
      <Show when={state().statusLine}>
        <p
          class="update-status"
          data-state={stateMark(state())}
          data-warning={state().liveLabel === "Not updating"}
          data-sync-reason={state().stop?.reason ?? ""}
        >
          {state().statusLine}
          <Show when={state().paused}>
            {" · "}
            <button type="button" onClick={resume}>
              Resume
            </button>
          </Show>
        </p>
      </Show>
      <span
        class="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-state={stateMark(state())}
      >
        {state().announcement}
      </span>
    </>
  );
};

const skipToPage = (event: MouseEvent) => {
  event.preventDefault();
  document.getElementById("main")!.focus();
};
const Shell = () => (
  <div class="shell">
    <a class="skip-link" href="#main" onClick={skipToPage}>
      Skip to page
    </a>
    <aside class="sidebar">
      <nav aria-label="Pages">
        <Link to="/" search={true}>
          Overview
        </Link>
      </nav>
      <Filters />
      <footer>
        <LiveStatus />
        <Settings />
      </footer>
    </aside>
    <main id="main" tabIndex={-1}>
      <Outlet />
    </main>
  </div>
);

const makeRouter = () => {
  const root = createRootRoute({ component: Shell });
  const overview = createRoute({ getParentRoute: () => root, path: "/", component: Overview });
  return createRouter({ routeTree: root.addChildren([overview]) });
};

declare module "@tanstack/solid-router" {
  interface Register {
    router: ReturnType<typeof makeRouter>;
  }
}

const problemClock = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
const Problem = (props: { state: EngineState }) => {
  const stop = () => (props.state.screen === "problem" ? props.state.stop : undefined);
  return (
    <main
      tabIndex={-1}
      data-problem-state={stateMark(props.state)}
      data-sync-reason={stop()?.reason ?? ""}
    >
      <h1>Can't load the dashboard</h1>
      <Show when={stop()} fallback={<p>Reload to try again.</p>}>
        {(value) => (
          <>
            <p role="status" aria-live="polite">
              {stopReason(value(), problemClock)}
            </p>
            <p>It will update automatically when this is fixed.</p>
          </>
        )}
      </Show>
    </main>
  );
};

const CompleteDashboard = (props: {
  state: EngineState;
  router: ReturnType<typeof makeRouter>;
  media?: Accessor<MediaSize> | undefined;
}) => {
  return (
    <MetaProvider>
      <PreferenceProvider>
        <Show
          when={props.state.screen === "dashboard" && props.state}
          fallback={<Problem state={props.state} />}
        >
          {(state) => (
            <PageState.Provider value={state}>
              <MediaSizeProvider value={props.media}>
                <RouterProvider router={props.router} />
              </MediaSizeProvider>
            </PageState.Provider>
          )}
        </Show>
      </PreferenceProvider>
    </MetaProvider>
  );
};

export const Dashboard = (props: {
  client: PageClient;
  ready: PromiseLike<void | object>;
  media?: Accessor<MediaSize> | undefined;
}) => {
  const [state, setState] = createSignal<EngineState>();
  const router = makeRouter();
  let latest: EngineState | undefined;
  let latestTiming!: ChangeTime;
  let painted = false;
  let closed = false;
  let historyMode: "push" | "replace" = "replace";
  const actions: PageClient = {
    ...props.client,
    request: (action: EngineAction, started?: number) => {
      historyMode = "push";
      return props.client.request(action, started);
    },
  };
  const update = (next: EngineState) => {
    if (next.screen === "dashboard")
      document.title = `Overview · ${next.rangeLabel} · opencode-stats`;
    if (
      next.screen === "dashboard" &&
      window.location.pathname + window.location.search !== next.address
    ) {
      router.history[historyMode](next.address);
      router.history.flush();
    }
    historyMode = "replace";
    preserveFilterFocus(() => setState(next));
  };
  const paint = (next: EngineState, timing: ChangeTime) =>
    changes.page(
      timing,
      () => update(next),
      () => !closed && state() === next,
    );
  const unsubscribe = props.client.subscribe((next, timing) => {
    latest = next;
    latestTiming = timing;
    if (painted) paint(next, timing);
  });
  // The existing responsive layout is CSS-only. Observe its real resize event
  // and time the resulting paint without introducing a second layout model.
  const resize = () => {
    if (painted) changes.local("resize", () => {});
  };
  onMount(() => {
    const visibility = () => props.client.signal({ kind: "visibility", visible: !document.hidden });
    const focus = () => props.client.signal({ kind: "focus" });
    const restore = () => {
      historyMode = "replace";
      void props.client.request({ kind: "address", address: window.location.href });
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("focus", focus);
    window.addEventListener("popstate", restore);
    window.addEventListener("resize", resize);
    visibility();
    onCleanup(() => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("focus", focus);
      window.removeEventListener("popstate", restore);
      window.removeEventListener("resize", resize);
    });
    void Promise.all([
      props.ready,
      props.client.request({ kind: "address", address: window.location.href }),
    ]).then(async ([, result]) => {
      if (closed || result.kind !== "paint") return undefined;
      if (result.state.screen === "dashboard") {
        router.history.replace(result.state.address);
        await router.load();
      }
      painted = true;
      return paint(latest!, latestTiming);
    });
  });
  onCleanup(() => {
    closed = true;
    changes.discard();
    unsubscribe();
    props.client.dispose();
  });
  return (
    <PageActions.Provider value={actions}>
      <Show when={state()}>
        {(complete) => <CompleteDashboard state={complete()} router={router} media={props.media} />}
      </Show>
    </PageActions.Provider>
  );
};

export const mountDashboard = (
  root: HTMLElement,
  client: PageClient,
  ready: PromiseLike<void | object>,
  media?: Accessor<MediaSize>,
) => render(() => <Dashboard client={client} ready={ready} media={media} />, root);
