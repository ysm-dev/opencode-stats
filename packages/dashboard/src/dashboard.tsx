import {
  Show,
  createContext,
  createSignal,
  onCleanup,
  onMount,
  useContext,
  type Accessor,
} from "solid-js";
import { render } from "solid-js/web";
import { MetaProvider } from "@solidjs/meta";
import { PreferenceProvider } from "./preferences.tsx";
import { Settings } from "./settings.tsx";
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/solid-router";
import type { EngineState, createPageClient } from "@opencode-stats/engine";

type PageClient = ReturnType<typeof createPageClient>;
type CompletePage = Extract<EngineState, { screen: "dashboard" }>;
const PageState = createContext<Accessor<CompletePage>>();
const PageActions = createContext<PageClient>();

const Overview = () => {
  const state = useContext(PageState)!;
  return (
    <>
      <header>
        <h1 tabIndex={-1}>Overview</h1>
        <p>{state().rangeLabel}</p>
        <UpdateStatus />
      </header>
      <section
        aria-labelledby="tokens"
        data-generation={state().generation}
        data-revision={state().revision}
      >
        <h2 id="tokens">Tokens</h2>
        <p class="headline-number">{state().tokens.total.toLocaleString("en-US")}</p>
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
  document.title = "Overview · opencode-stats";
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
  const unsubscribe = props.client.subscribe((next) => {
    latest = next;
    if (painted) setState(next);
  });
  onMount(() => {
    const visibility = () => props.client.signal({ kind: "visibility", visible: !document.hidden });
    const focus = () => props.client.signal({ kind: "focus" });
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("focus", focus);
    visibility();
    onCleanup(() => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("focus", focus);
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
      return setState(latest!);
    });
  });
  onCleanup(() => {
    closed = true;
    unsubscribe();
    props.client.dispose();
  });
  return (
    <PageActions.Provider value={props.client}>
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
