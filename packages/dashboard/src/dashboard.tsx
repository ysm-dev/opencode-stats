import { Show, createSignal, onCleanup, onMount, useContext } from "solid-js";
import { render } from "solid-js/web";
import { MetaProvider } from "@solidjs/meta";
import { Select } from "@opencode/ui/select";
import { PreferenceProvider } from "./preferences.tsx";
import { Settings } from "./settings.tsx";
import { Filters, FilterChips } from "./filters.tsx";
import { PageState, PageActions } from "./page-context.ts";
import { preserveFilterFocus } from "./filter-focus.ts";
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
  type createPageClient,
} from "@opencode-stats/engine";

type PageClient = ReturnType<typeof createPageClient>;
const focusRange = () =>
  document.querySelector<HTMLElement>('.range-control [data-component="select-v2"]')!.focus();

const RangeControls = () => {
  const state = useContext(PageState)!;
  const client = useContext(PageActions)!;
  const selectPreset = (preset: (typeof presets)[number] | null) => {
    if (preset) void client.request({ kind: "preset", preset });
  };
  const nextRange = () => {
    focusRange();
    void client.request({ kind: "shift", direction: 1 });
  };
  const removeFixed = () => {
    focusRange();
    void client.request({ kind: "preset", preset: state().range.preset });
  };
  return (
    <div class="range-control" aria-label="Time range" role="group" data-range={state().address}>
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

const PreviousNumber = (props: { metric: "tokens" | "sessions" }) => {
  const state = useContext(PageState)!;
  return (
    <Show when={state().comparison[props.metric]}>
      <p class="previous-period">
        {state().comparison[props.metric]}
        <br />
        <small>{state().comparison.caption}</small>
      </p>
    </Show>
  );
};

const Overview = () => {
  const state = useContext(PageState)!;
  return (
    <>
      <header>
        <h1 tabIndex={-1}>Overview</h1>
        <RangeControls />
        <FilterChips />
        <UpdateStatus />
      </header>
      <section
        aria-labelledby="tokens"
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
        data-generation={state().generation}
        data-revision={state().revision}
        data-range={state().address}
      >
        <h2 id="sessions">Sessions</h2>
        <p class="headline-number">{state().sessions.total.toLocaleString("en-US")}</p>
        <p>+ {state().sessions.subagents.toLocaleString("en-US")} subagent sessions</p>
        <PreviousNumber metric="sessions" />
      </section>
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
      data-generation={state().generation}
      data-revision={state().revision}
      data-updating={!state().paused && !state().statusLine}
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
    document.querySelector<HTMLButtonElement>(".live-status")!.focus();
    client.signal({ kind: "paused", paused: false });
  };
  return (
    <>
      <Show when={state().statusLine}>
        <p class="update-status" data-warning={!state().paused}>
          {state().statusLine}
          <Show when={state().paused}>
            {" · "}
            <button type="button" onClick={resume}>
              Resume
            </button>
          </Show>
        </p>
      </Show>
      <span class="sr-only" role="status" aria-live="polite" aria-atomic="true">
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

const CompleteDashboard = (props: {
  state: EngineState;
  router: ReturnType<typeof makeRouter>;
}) => {
  return (
    <MetaProvider>
      <PreferenceProvider>
        <Show
          when={props.state.screen === "dashboard" && props.state}
          fallback={
            <main tabIndex={-1}>
              <h1>Can't load the dashboard</h1>
              <p>Reload to try again.</p>
            </main>
          }
        >
          {(state) => (
            <PageState.Provider value={state}>
              <RouterProvider router={props.router} />
            </PageState.Provider>
          )}
        </Show>
      </PreferenceProvider>
    </MetaProvider>
  );
};

export const Dashboard = (props: { client: PageClient; ready: PromiseLike<void | object> }) => {
  const [state, setState] = createSignal<EngineState>();
  const router = makeRouter();
  let latest: EngineState | undefined;
  let painted = false;
  let closed = false;
  let historyMode: "push" | "replace" = "replace";
  const actions: PageClient = {
    ...props.client,
    request: (action: EngineAction) => {
      historyMode = "push";
      return props.client.request(action);
    },
  };
  const paint = (next: EngineState) => {
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
  const unsubscribe = props.client.subscribe((next) => {
    latest = next;
    if (painted) paint(next);
  });
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
    visibility();
    onCleanup(() => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("focus", focus);
      window.removeEventListener("popstate", restore);
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
      return paint(latest!);
    });
  });
  onCleanup(() => {
    closed = true;
    unsubscribe();
    props.client.dispose();
  });
  return (
    <PageActions.Provider value={actions}>
      <Show when={state()}>
        {(complete) => <CompleteDashboard state={complete()} router={router} />}
      </Show>
    </PageActions.Provider>
  );
};

export const mountDashboard = (
  root: HTMLElement,
  client: PageClient,
  ready: PromiseLike<void | object>,
) => render(() => <Dashboard client={client} ready={ready} />, root);
