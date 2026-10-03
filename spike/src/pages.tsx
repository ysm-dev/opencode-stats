import { createRoute, Link, useNavigate } from "@tanstack/solid-router";
import { rootRoute } from "./root.tsx";

export const overviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => (
    <main>
      <h1>Overview</h1>
      <Link to="/models">Models</Link>
    </main>
  ),
});

export const modelsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/models",
  component: Models,
});

function Models() {
  const navigate = useNavigate();
  return (
    <main>
      <h1>Models</h1>
      <button onClick={() => void navigate({ to: "/" })}>Overview</button>
    </main>
  );
}
