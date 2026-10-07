import { join } from "node:path";
import * as Effect from "effect/Effect";
import * as fc from "fast-check";
import { expect, it } from "vitest";
import { propertyParameters } from "@opencode-stats/browser-copy/testing";
import { syntheticFixture, readBuilt } from "./testing/index.ts";
import { observedStore } from "./testing/store.ts";
import { runWithClock } from "./testing/clock.ts";
import { canonicalCopy } from "./testing/canonical.ts";
import {
  cachedCatalog,
  rate,
  tier,
  priceCatalog,
  pricedMessage,
  pricedTokens,
} from "./testing/pricing.ts";
import { nodeRuntime, nodeDatabase, nodeSource } from "./runtime.node.ts";
import { sync } from "./sync.ts";
import type { SourceAdapter } from "./source-reader.ts";
import type { StoreRuntime } from "./database.ts";

it("prices exact context thresholds, legacy tiers, named modes and reasoning without guessing providers or absent usage", async () => {
  const f = syntheticFixture();
  const { writer } = f;
  writer.session("pricing");
  const catalog = {
    p: {
      name: "Provider",
      models: {
        exact: {
          name: "Exact",
          cost: {
            ...rate(),
            reasoning: 99,
            input_audio: 99,
            output_audio: 99,
            tiers: [tier(600, 10), tier(599, 20), tier(500, 30)],
            context_over_200k: rate(99),
          },
        },
        empty: { cost: { ...rate(), tiers: [], context_over_200k: rate(99) } },
        legacy: { cost: { ...rate(), context_over_200k: rate(9) } },
        base: {
          name: "Base",
          cost: { ...rate(), tiers: [tier(500, 7)] },
          experimental: {
            modes: {
              inherited: {},
              pro: { cost: { input: 4, output: 5, tiers: [tier(500, 8), tier(700, 9)] } },
            },
          },
        },
        "base-pro": { name: "Exact Pro", cost: rate(6) },
        anonymous: { experimental: { modes: { empty: {}, priced: { cost: rate(5) } } } },
        free: { cost: rate(0, 0, 0, 0) },
        missing: { experimental: {} },
        omittedCache: { cost: { input: 1, output: 2 } },
      },
    },
  };
  writer.catalog(cachedCatalog(catalog, 123, "synthetic-digest"));
  const models = [
    "exact",
    "empty",
    "legacy",
    "base-inherited",
    "base-pro",
    "anonymous-empty",
    "anonymous-priced",
    "free",
    "missing",
    "omittedCache",
    "unlisted",
  ];
  for (const [seq, model] of models.entries()) writer.message(pricedMessage(model, model, seq));
  writer.message({ ...pricedMessage("other-provider", "free", 11), provider: "other" });
  const missingUsage = { ...pricedMessage("missing-usage", "free", 12) };
  delete missingUsage.tokens;
  writer.message(missingUsage);
  writer.message({ ...pricedMessage("partial-usage", "exact", 13), tokens: { input: 1 } });
  for (const [seq, context] of [200000, 200001].entries())
    writer.message({
      ...pricedMessage(`legacy-${context}`, "legacy", 14 + seq),
      tokens: { ...pricedTokens, input: context - 500 },
    });
  // This mode overrides a matching base threshold, retains the other base tier,
  // and fills omitted cache rates with OpenCode's explicit zero defaults.
  writer.catalog(
    cachedCatalog(
      {
        ...catalog,
        q: {
          models: {
            named: { name: "Named", cost: rate(), experimental: { modes: { inherited: {} } } },
          },
        },
        p: {
          ...catalog.p,
          models: {
            ...catalog.p.models,
            merge: {
              cost: { ...rate(), tiers: [tier(500, 7), tier(700, 9)] },
              experimental: {
                modes: { pro: { cost: { input: 4, output: 5, tiers: [tier(500, 8)] } } },
              },
            },
          },
        },
      },
      123,
      "synthetic-digest",
    ),
  );
  writer.message(pricedMessage("merged", "merge-pro", 16));
  writer.message({ ...pricedMessage("unnamed-provider", "named-inherited", 19), provider: "q" });
  writer.message({
    ...pricedMessage("mode-default", "merge-pro", 17),
    tokens: { ...pricedTokens, cache: { read: 0, write: 0 } },
  });
  writer.message({
    ...pricedMessage("mode-retained", "merge-pro", 18),
    tokens: { ...pricedTokens, input: 201 },
  });
  try {
    const copy = await readBuilt({ source: f.source, cacheHome: f.folder }, () => {}, nodeRuntime);
    const estimates = new Map(copy.facts.map((fact) => [fact.id, fact.estimatedCost]));
    for (const [id, expected] of [
      ["exact", 0.0056],
      ["empty", 0.0037],
      ["legacy", 0.0037],
      ["base-inherited", 0.0043],
      ["base-pro", 0.0042],
      ["anonymous-empty", null],
      ["anonymous-priced", 0.0041],
      ["free", 0],
      ["missing", null],
      ["omittedCache", 0.0019],
      ["unlisted", null],
      ["other-provider", null],
      ["missing-usage", null],
      ["partial-usage", null],
      ["merged", 0.0044],
      ["unnamed-provider", 0.0037],
      ["mode-default", 0.0049],
      ["mode-retained", 0.005409],
    ] as const)
      expect(estimates.get(id)).toBe(expected);
    expect(estimates.get("legacy-200000")).toBe((199500 + 600 + 1200 + 1800) / 1000000);
    expect(estimates.get("legacy-200001")).toBe((199501 * 9 + 600 + 1200 + 1800) / 1000000);
    expect(copy.facts.every((fact) => fact.recordedCost === 0.123)).toBe(true);
    expect(copy.pricing.catalog).toMatchObject({
      source: "opencode",
      stamp: 1,
      updatedAt: 123,
      digest: "synthetic-digest",
    });
    expect(copy.pricing.models.find((model) => model.id === "p/free")!.price).not.toBeNull();
    expect(copy.pricing.models.find((model) => model.id === "p/missing")!.price).toBeNull();
    expect(copy.names.find((name) => name.id === "p/base-inherited")!.name).toBe(
      "Base Inherited · Provider",
    );
    expect(copy.names.find((name) => name.id === "p/base-pro")!.name).toBe("Exact Pro · Provider");
    expect(copy.names.find((name) => name.id === "p/anonymous-priced")!.name).toBe(
      "anonymous-priced",
    );
    expect(copy.names.find((name) => name.id === "q/named-inherited")!.name).toBe(
      "Named Inherited · q",
    );
  } finally {
    f.dispose();
  }
});

it("reads catalog stamps on passes, reprices only changed models, preserves recorded cost, and publishes name-only changes without rewriting facts", async () => {
  const f = syntheticFixture();
  const { writer, source, folder } = f;
  writer.session("pricing");
  writer.catalog(cachedCatalog(priceCatalog(), 1));
  writer.message(pricedMessage("m", "m"));
  writer.message(pricedMessage("stable", "stable", 1));
  try {
    await runWithClock((time) =>
      Effect.gen(function* () {
        const store = yield* observedStore({ source, cacheHome: folder }, nodeRuntime);
        const initial = yield* store.read();
        writer.catalog(cachedCatalog(priceCatalog(2), 2, "second"), 2);
        yield* time.tick;
        const updated = yield* store.read();
        expect((yield* store.read(initial)).facts.map((fact) => fact.id)).toEqual(["m"]);
        expect(updated.facts.map((fact) => fact.estimatedCost)).toEqual([0.0038, 0.0036]);
        expect(updated.facts.map((fact) => fact.recordedCost)).toEqual([0.123, 0.123]);
        writer.catalog(cachedCatalog(priceCatalog(2, "Renamed"), 3), 3);
        yield* time.tick;
        const renamed = yield* store.read(updated);
        expect(renamed.facts).toEqual([]);
        expect(renamed.names.find((name) => name.id === "p/m")!.name).toBe(
          "Renamed · Synthetic Provider",
        );
        expect(renamed.pricing.catalog).toMatchObject({ updatedAt: 3, digest: null });
        writer.catalog(cachedCatalog(priceCatalog(2, "Renamed"), 4), 4);
        yield* time.tick;
        expect((yield* store.read(renamed)).facts).toEqual([]);
        const beforeRemoved = yield* store.read();
        writer.catalog(cachedCatalog({ p: { models: { stable: { cost: rate(0) } } } }, 5), 5);
        yield* time.tick;
        const removed = yield* store.read(beforeRemoved);
        expect(removed.facts.map((fact) => [fact.id, fact.estimatedCost])).toEqual([["m", null]]);
        expect(removed.names.find((name) => name.id === "p/m")!.name).toBe("m");
        writer.catalog(null);
        yield* time.tick;
        const fallback = yield* store.read();
        expect(fallback.pricing.catalog.source).toBe("snapshot");
        expect(fallback.facts.every((fact) => fact.estimatedCost === null)).toBe(true);
        const fresh = yield* observedStore(
          { source, cacheHome: join(folder, "fresh") },
          nodeRuntime,
        );
        expect(canonicalCopy(fallback)).toEqual(canonicalCopy(yield* fresh.read()));
      }),
    );
  } finally {
    f.dispose();
  }
});

it("reads the update time every pass but the catalog body only when its row moves", async () => {
  const f = syntheticFixture();
  f.writer.session("pricing");
  const body = cachedCatalog(priceCatalog());
  f.writer.catalog(body);
  f.writer.message(pricedMessage("m", "m"));
  const reads = { stamps: 0, bodies: 0 };
  const source: SourceAdapter = (filename) =>
    nodeSource(filename).pipe(
      Effect.map((reader) => ({
        ...reader,
        catalogStamp: reader.catalogStamp.pipe(Effect.tap(() => Effect.sync(() => reads.stamps++))),
        catalog: reader.catalog.pipe(Effect.tap(() => Effect.sync(() => reads.bodies++))),
      })),
    );
  const runtime: StoreRuntime = {
    ...nodeRuntime,
    worker: (paths, announce = () => Effect.void) => sync(paths, nodeDatabase, source, announce),
  };
  try {
    await runWithClock((time) =>
      Effect.gen(function* () {
        const store = yield* observedStore({ source: f.source, cacheHome: f.folder }, runtime);
        const initial = yield* store.read();
        expect(reads).toEqual({ stamps: 1, bodies: 1 });
        f.writer.archive("pricing");
        yield* time.tick;
        expect(reads).toEqual({ stamps: 2, bodies: 1 });
        f.writer.catalog(body, 2);
        yield* time.tick;
        expect(reads).toEqual({ stamps: 3, bodies: 2 });
        expect((yield* store.read(initial)).facts).toEqual([]);
      }),
    );
  } finally {
    f.dispose();
  }
});

const malformedModel = (model: object) => cachedCatalog({ p: { models: { m: model } } });
it.each([
  "bad json",
  "null",
  JSON.stringify({ updatedAt: 1, body: {} }),
  JSON.stringify({ updatedAt: "now", body: "{}" }),
  JSON.stringify({ updatedAt: 1.5, body: "{}" }),
  JSON.stringify({ updatedAt: 1, digest: 2, body: "{}" }),
  malformedModel({ cost: { input: -1, output: 1 } }),
  malformedModel({ cost: { input: 1 } }),
  malformedModel({ cost: null }),
  malformedModel({ cost: { ...rate(), tiers: [{ ...rate(), tier: { type: "other", size: 1 } }] } }),
  ...[false, true].map((reverse) => {
    const tiers = [tier(500, 7), tier(500, 9)];
    return malformedModel({ cost: { ...rate(), tiers: reverse ? tiers.toReversed() : tiers } });
  }),
  malformedModel({
    experimental: { modes: { pro: { cost: { ...rate(), tiers: [tier(500, 7), tier(500, 9)] } } } },
  }),
  malformedModel({ cost: { ...rate(), context_over_200k: { input: "1", output: 2 } } }),
  malformedModel({ experimental: { modes: { pro: { cost: [] } } } }),
  malformedModel({ cost: { ...rate(), cache_read: -1 } }),
])("rejects a malformed cached catalog and uses the shipped snapshot (%#)", async (raw) => {
  const f = syntheticFixture();
  f.writer.session("pricing");
  f.writer.message(pricedMessage("m", "m"));
  f.writer.catalog(raw);
  try {
    const copy = await readBuilt({ source: f.source, cacheHome: f.folder }, () => {}, nodeRuntime);
    expect(copy.pricing.catalog.source).toBe("snapshot");
    expect(copy.facts[0]!.estimatedCost).toBeNull();
  } finally {
    f.dispose();
  }
});

it("resumes decoded catalog provenance after restarting without a changed stamp", async () => {
  const f = syntheticFixture();
  f.writer.session("pricing");
  f.writer.message(pricedMessage("m", "m"));
  f.writer.catalog(cachedCatalog(priceCatalog(), 100));
  try {
    const options = { source: f.source, cacheHome: f.folder };
    const first = await readBuilt(options, () => {}, nodeRuntime);
    const resumed = await readBuilt(options, () => {}, nodeRuntime);
    expect(resumed.revision).toBe(first.revision);
    expect(resumed.pricing).toEqual(first.pricing);
    expect(canonicalCopy(resumed)).toEqual(canonicalCopy(first));
    // Reopening also notices a changed body at an unchanged timestamp (or a
    // newer release's snapshot), and gives re-estimated facts a new revision.
    f.writer.catalog(cachedCatalog(priceCatalog(2), 100));
    const repriced = await readBuilt(options, () => {}, nodeRuntime);
    expect(repriced.revision).toBe(first.revision + 1);
    expect(repriced.facts[0]!.estimatedCost).toBe(0.0038);
    expect(repriced.facts[0]!.revision).toBe(repriced.revision);
  } finally {
    f.dispose();
  }
});

it.each([0, 1, 2, 3])(
  "incremental catalog and usage changes equal a fresh final-state build (partition %i)",
  async (partition) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.tuple(fc.integer({ min: 0, max: 4 }), fc.integer({ min: 0, max: 1000 })), {
          minLength: 1,
          maxLength: 5,
        }),
        async (actions) => {
          const f = syntheticFixture();
          f.writer.session("pricing");
          f.writer.message(pricedMessage("m", "m"));
          try {
            await runWithClock((time) =>
              Effect.gen(function* () {
                const store = yield* observedStore(
                  { source: f.source, cacheHome: f.folder },
                  nodeRuntime,
                );
                for (const [index, [input, context]] of actions.entries()) {
                  f.writer.catalog(
                    cachedCatalog(
                      {
                        p: {
                          models: {
                            m: {
                              cost: {
                                ...rate(input),
                                tiers: [tier(context + (input % 2 === 0 ? 500 : 0), input * 2)],
                              },
                            },
                          },
                        },
                      },
                      index + 1,
                    ),
                    index + 1,
                  );
                  f.writer.message({
                    ...pricedMessage("m", "m"),
                    tokens: { ...pricedTokens, input: context },
                  });
                  yield* time.tick;
                  const rateInUse = input % 2 === 0 ? input : input * 2;
                  expect((yield* store.read()).facts[0]!.estimatedCost).toBe(
                    (context * rateInUse + 3600) / 1000000,
                  );
                }
                const incremental = yield* store.read();
                const fresh = yield* observedStore(
                  { source: f.source, cacheHome: join(f.folder, "fresh") },
                  nodeRuntime,
                );
                expect(canonicalCopy(incremental)).toEqual(canonicalCopy(yield* fresh.read()));
                expect(incremental.pricing).toEqual((yield* fresh.read()).pricing);
              }),
            );
          } finally {
            f.dispose();
          }
        },
      ),
      { ...propertyParameters, seed: propertyParameters.seed + partition, numRuns: 4 },
    );
  },
);
