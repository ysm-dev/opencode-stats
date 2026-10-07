import { eq } from "drizzle-orm";
import * as Effect from "effect/Effect";
import { Database } from "./database.ts";
import { dimensionNames, metadata, modelPrices, pricingCatalog, steps } from "./schema.ts";
import { catalogModels, parseCatalog, type CatalogModel, type Price } from "./catalog.ts";
import type { SourceReader } from "./source-reader.ts";
import snapshot from "./prices.json" with { type: "json" };
import { mapTokenFields, type TokenKind } from "@opencode-stats/browser-copy";

const snapshotCatalog = parseCatalog(snapshot);
const snapshotModels = catalogModels(snapshotCatalog);

type Usage = Readonly<Record<TokenKind, number | null>>;
function estimate(tokens: Usage, price: Price | null): number | null {
  if (!price || Object.values(tokens).some((value) => value === null)) return null;
  const context = tokens.input! + tokens.cacheRead! + tokens.cacheWrite!;
  const tier = price.tiers.findLast((candidate) => context > candidate.size) ?? price;
  return (
    (tokens.input! * tier.input +
      tokens.cacheRead! * tier.cache_read +
      tokens.cacheWrite! * tier.cache_write +
      (tokens.output! + tokens.reasoning!) * tier.output) /
    1000000
  );
}
const fallback = (id: string): CatalogModel => ({
  name: id.slice(id.indexOf("/") + 1),
  price: null,
});
const priceJson = (model: CatalogModel) =>
  model.price === null ? null : JSON.stringify(model.price);

const syncPricing = Effect.fnUntraced(function* (reader: SourceReader) {
  const db = yield* Database;
  const stamp = yield* reader.catalogStamp;
  const previous = (yield* db.select().from(pricingCatalog))[0];
  // The body is read only when OpenCode's catalog row moves, including removals.
  const raw = !previous || previous.stamp !== stamp ? yield* reader.catalog : undefined;
  // A connection retains its decoded catalog across passes; restart reconstructs
  // it once from the read-only source, never from an unvalidated price JSON.
  return { stamp, previous, raw };
});

export const pricingForPass = (reader: SourceReader) => {
  let models: ReadonlyMap<string, CatalogModel> | undefined;
  return Effect.fnUntraced(function* (announce: () => Effect.Effect<void, Error>) {
    const db = yield* Database;
    const update = yield* syncPricing(reader);
    if (!models || update.raw !== undefined) {
      const raw = update.raw === undefined ? yield* reader.catalog : update.raw;
      let catalog = snapshotCatalog;
      let source = "snapshot";
      if (raw !== null) {
        try {
          catalog = parseCatalog(raw);
          source = "opencode";
        } catch {
          // Bad source catalogs are rejected, never treated as a free tariff.
        }
      }
      models = source === "snapshot" ? snapshotModels : catalogModels(catalog);
      const row = {
        id: 1,
        source,
        stamp: update.stamp,
        updatedAt: catalog.updatedAt,
        digest: catalog.digest ?? null,
      };
      let changed = (["source", "stamp", "updatedAt", "digest"] as const).some(
        (key) => update.previous?.[key] !== row[key],
      );
      yield* db.$client.withTransaction(
        Effect.gen(function* () {
          const header = (yield* db.select().from(metadata))[0]!;
          const revision = header.revision + 1;
          const used = yield* db.select().from(modelPrices);
          const names = yield* db.select().from(dimensionNames);
          for (const old of used) {
            const next = models!.get(old.id) ?? fallback(old.id);
            const price = priceJson(next);
            const name = names.find(
              (candidate) => candidate.dimension === "model" && candidate.id === old.id,
            )!;
            if (old.price !== price) {
              changed = true;
              const facts = yield* db.select().from(steps).where(eq(steps.model, name.code));
              for (const fact of facts)
                yield* db
                  .update(steps)
                  .set({
                    estimatedCost: estimate(
                      mapTokenFields((kind) => fact[kind]),
                      next.price,
                    ),
                    revision,
                  })
                  .where(eq(steps.id, fact.id));
            }
            if (old.name !== next.name) {
              changed = true;
              yield* db
                .update(dimensionNames)
                .set({ name: next.name, revision })
                .where(eq(dimensionNames.code, name.code));
            }
            yield* db
              .update(modelPrices)
              .set({ name: next.name, price })
              .where(eq(modelPrices.id, old.id));
          }
          yield* db
            .insert(pricingCatalog)
            .values(row)
            .onConflictDoUpdate({ target: pricingCatalog.id, set: row });
          if (header.revision > 0 && changed)
            yield* db.update(metadata).set({ revision }).where(eq(metadata.id, 1));
        }),
      );
      if (update.previous && changed) yield* announce();
    }
    const used = new Set((yield* db.select().from(modelPrices)).map((row) => row.id));
    const catalogModelsForPass = models;
    return Effect.fnUntraced(function* (
      provider: string | null,
      model: string | null,
      tokens: Usage,
    ) {
      if (provider === null || model === null) return { estimatedCost: null, name: undefined };
      const id = `${provider}/${model}`;
      const item = catalogModelsForPass.get(id) ?? fallback(id);
      if (!used.has(id)) {
        yield* db.insert(modelPrices).values({ id, name: item.name, price: priceJson(item) });
        used.add(id);
      }
      return { estimatedCost: estimate(tokens, item.price), name: item.name };
    });
  });
};
export type StepPricer = Effect.Success<ReturnType<ReturnType<typeof pricingForPass>>>;
