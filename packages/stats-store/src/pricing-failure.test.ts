import * as Effect from "effect/Effect";
import { expect, it } from "vitest";
import { type StoreCopy, type StoreEvent } from "./store.ts";
import { nodeRuntime, nodeDatabase, nodeSource } from "./runtime.node.ts";
import { sync } from "./sync.ts";
import { syntheticFixture, readBuilt } from "./testing/index.ts";
import { cachedCatalog, priceCatalog, pricedMessage } from "./testing/pricing.ts";

it.each(["catalog", "model"])(
  "sanitizes a genuine %s pricing write failure and retains the prior priced copy",
  async (mode) => {
    const f = syntheticFixture();
    const privateName = "SYNTHETIC PRIVATE PRICING MODEL";
    try {
      f.writer.session("pricing");
      f.writer.catalog(cachedCatalog(priceCatalog()));
      f.writer.message(pricedMessage("step", "m"));
      const options = { source: f.source, cacheHome: f.folder };
      const initial = await readBuilt(options, () => {}, nodeRuntime);
      if (mode === "catalog") f.writer.catalog(cachedCatalog(priceCatalog(1, privateName), 2), 2);
      else f.writer.message(pricedMessage("new-step", privateName, 1));
      const retained: StoreCopy[] = [];
      const reports: StoreEvent[] = [];
      const stopped = await readBuilt(
        options,
        (copy) => retained.push(copy),
        {
          ...nodeRuntime,
          worker: (paths, announce = () => Effect.void, report) =>
            sync(
              paths,
              (config) => nodeDatabase({ ...config, readonly: true }),
              nodeSource,
              announce,
              report,
            ),
        },
        (event) => reports.push(event),
      );
      expect(reports).toContainEqual(
        expect.objectContaining({
          kind: "sync.stopped",
          reason: "store.unwritable",
          code: "permission",
        }),
      );
      expect(stopped).toEqual(initial);
      const exposed = JSON.stringify(reports);
      expect(exposed).not.toContain(privateName);
      expect(exposed).not.toContain("Failed query:");
      expect(exposed).not.toContain("params:");
      expect(retained).toHaveLength(1);
      expect(retained[0]).toMatchObject({
        generation: initial.generation,
        revision: initial.revision,
        steps: initial.steps,
        pricing: initial.pricing,
      });
      const restored = await readBuilt(options, () => {}, nodeRuntime);
      expect(restored.generation).toBe(initial.generation);
      expect(restored.pricing.models.some((model) => model.name.includes(privateName))).toBe(true);
    } finally {
      f.dispose();
    }
  },
);
