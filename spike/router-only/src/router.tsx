import { createRouter } from "@tanstack/solid-router";
import { modelsRoute, overviewRoute } from "./pages.tsx";
import { rootRoute } from "./root.tsx";

const routeTree = rootRoute.addChildren([overviewRoute, modelsRoute]);

export function getRouter() {
  return createRouter({ routeTree, defaultPendingComponent: () => null });
}

declare module "@tanstack/solid-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
