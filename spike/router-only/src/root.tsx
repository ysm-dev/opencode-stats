import { createRootRoute, HeadContent, Outlet } from "@tanstack/solid-router";

export const rootRoute = createRootRoute({
  component: () => (
    <>
      <HeadContent />
      <Outlet />
    </>
  ),
});
