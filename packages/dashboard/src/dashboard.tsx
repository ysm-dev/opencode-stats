import { For, createEffect } from "solid-js";
import { MetaProvider } from "@solidjs/meta";
import { ThemeProvider } from "@opencode/ui/theme/context";
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/solid-router";

const pages = [
  { path: "/", title: "Overview" },
  { path: "/models", title: "Models" },
  { path: "/projects", title: "Projects" },
  { path: "/agents", title: "Agents" },
  { path: "/tools", title: "Tools" },
  { path: "/sessions", title: "Sessions" },
] as const;

const Page = (props: { title: string }) => {
  createEffect(() => {
    document.title = `${props.title} · opencode-stats`;
  });
  return (
    <>
      <h1>{props.title}</h1>
      <p>No activity to show yet.</p>
    </>
  );
};

const PageLink = (page: (typeof pages)[number]) => <Link to={page.path}>{page.title}</Link>;

const Shell = () => (
  <>
    <a class="skip-link" href="#main">
      Skip to content
    </a>
    <header>
      <span>opencode-stats</span>
    </header>
    <nav aria-label="Pages">
      <For each={pages}>{PageLink}</For>
    </nav>
    <main id="main" tabIndex={-1}>
      <Outlet />
    </main>
  </>
);

const root = createRootRoute({ component: Shell });
const routes = pages.map((page) =>
  createRoute({
    getParentRoute: () => root,
    path: page.path,
    component: () => <Page title={page.title} />,
  }),
);

const makeRouter = () => createRouter({ routeTree: root.addChildren(routes) });

declare module "@tanstack/solid-router" {
  interface Register {
    router: ReturnType<typeof makeRouter>;
  }
}

export const Dashboard = () => (
  <MetaProvider>
    <ThemeProvider defaultTheme="oc-2">
      <RouterProvider router={makeRouter()} />
    </ThemeProvider>
  </MetaProvider>
);
