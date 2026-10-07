import * as Effect from "effect/Effect";
import { expect, it } from "vitest";
import { SqlFailure, stayInSync, type StoreCopy } from "./store.ts";
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
      const failure = await Effect.runPromise(
        Effect.scoped(
          stayInSync(
            options,
            {
              ...nodeRuntime,
              worker: (paths, announce = () => Effect.void) =>
                sync(
                  paths,
                  (config) => nodeDatabase({ ...config, readonly: true }),
                  nodeSource,
                  announce,
                ),
            },
            (copy) => retained.push(copy),
          ),
        ).pipe(
          Effect.match({
            onFailure: (error) => error,
            onSuccess: () => undefined,
          }),
        ),
      );
      expect(failure).toBeInstanceOf(SqlFailure);
      if (!(failure instanceof SqlFailure)) throw new Error("Expected the public SQL failure");
      expect(failure).toMatchObject({
        kind: "sqlite",
        code: "SQLITE_READONLY",
        statement: "writeSteps",
        message: "Stats store build failed.",
      });
      const exposed = JSON.stringify(failure) + failure.message;
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
