import { createFileRoute, useNavigate } from "@tanstack/solid-router";

export const Route = createFileRoute("/models")({ component: Models });

function Models() {
  const navigate = useNavigate();
  return (
    <main>
      <h1>Models</h1>
      <button onClick={() => void navigate({ to: "/" })}>Overview</button>
    </main>
  );
}
