import { createRouter } from "@tanstack/solid-router";
import { routeTree } from "./routeTree.gen.ts";

export function getRouter() {
  return createRouter({ routeTree, defaultPendingComponent: () => null });
}

declare module "@tanstack/solid-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
