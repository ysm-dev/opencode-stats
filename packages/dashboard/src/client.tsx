import { createPageClient } from "@opencode-stats/engine";
import { mountDashboard } from "./dashboard.tsx";

const client = createPageClient(
  new Worker(new URL("@opencode-stats/engine/worker", import.meta.url), { type: "module" }),
);
mountDashboard(document.getElementById("root")!, client, document.fonts.load("440 13px Inter"));
