import { createFileRoute, Link } from "@tanstack/solid-router";

export const Route = createFileRoute("/")({
  component: () => (
    <main>
      <h1>Overview</h1>
      <Link to="/models">Models</Link>
    </main>
  ),
});
