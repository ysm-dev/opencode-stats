import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { parseCatalog } from "../packages/stats-store/src/catalog.ts";

const response = await fetch("https://models.opencode.ai/api.json", {
  signal: AbortSignal.timeout(10000),
});
if (!response.ok) throw new Error(`Price catalog fetch failed: ${response.status}`);
const text = await response.text();
const updatedAt = Date.now();
const digest = createHash("sha256").update(text).digest("hex");
const catalog = parseCatalog({ updatedAt, digest, body: text });
const body = Object.fromEntries(
  Object.entries(catalog.body).map(([provider, value]) => [
    provider,
    {
      models: Object.fromEntries(
        Object.entries(value.models).map(([model, details]) => [
          model,
          {
            cost: details.cost,
            experimental: details.experimental,
          },
        ]),
      ),
    },
  ]),
);
// Provider/model keys retain exact identity; only token tariffs and named modes
// ship. Display names are supplied by OpenCode's catalog when it is present.
writeFileSync(
  "packages/stats-store/src/prices.json",
  `${JSON.stringify({ updatedAt, digest, body: JSON.stringify(body) }, null, 2)}\n`,
);
