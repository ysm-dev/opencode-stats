import * as Schema from "effect/Schema";

const rate = Schema.Number.check(Schema.isFinite(), Schema.isGreaterThanOrEqualTo(0));
const rates = {
  input: rate,
  output: rate,
  cache_read: Schema.optional(rate),
  cache_write: Schema.optional(rate),
  reasoning: Schema.optional(rate),
  input_audio: Schema.optional(rate),
  output_audio: Schema.optional(rate),
};
const tariff = Schema.Struct({
  ...rates,
  tiers: Schema.optional(
    Schema.Array(
      Schema.Struct({
        ...rates,
        tier: Schema.Struct({ type: Schema.Literal("context"), size: rate.check(Schema.isInt()) }),
      }),
    ).check(
      Schema.makeFilter(
        (tiers) => new Set(tiers.map((entry) => entry.tier.size)).size === tiers.length,
        { message: "Duplicate context price tier" },
      ),
    ),
  ),
  context_over_200k: Schema.optional(Schema.Struct(rates)),
});
const providers = Schema.Record(
  Schema.String,
  Schema.Struct({
    id: Schema.optional(Schema.String),
    name: Schema.optional(Schema.String),
    models: Schema.Record(
      Schema.String,
      Schema.Struct({
        id: Schema.optional(Schema.String),
        name: Schema.optional(Schema.String),
        cost: Schema.optional(tariff),
        experimental: Schema.optional(
          Schema.Struct({
            modes: Schema.optional(
              Schema.Record(Schema.String, Schema.Struct({ cost: Schema.optional(tariff) })),
            ),
          }),
        ),
      }),
    ),
  }),
);
const envelope = Schema.Struct({
  updatedAt: rate.check(Schema.isInt()),
  digest: Schema.optional(Schema.String),
  body: Schema.fromJsonString(providers),
});
type Catalog = typeof envelope.Type;
type Tariff = typeof tariff.Type;
// oxlint-disable-next-line typescript/no-restricted-types -- trust boundary: cached catalog or public API snapshot JSON
export function parseCatalog(input: unknown): Catalog {
  return typeof input === "string"
    ? Schema.decodeUnknownSync(Schema.fromJsonString(envelope))(input)
    : Schema.decodeUnknownSync(envelope)(input);
}

type Rates = ReturnType<typeof normalized>;
export type Price = Rates & { tiers: readonly (Rates & { size: number })[] };
export type CatalogModel = { name: string; price: Price | null };
const normalized = (value: Pick<Tariff, "input" | "output" | "cache_read" | "cache_write">) => ({
  input: value.input,
  output: value.output,
  cache_read: value.cache_read ?? 0,
  cache_write: value.cache_write ?? 0,
});
function price(cost: Tariff | undefined): Price | null {
  if (!cost) return null;
  const tiers =
    cost.tiers === undefined
      ? cost.context_over_200k
        ? [{ ...normalized(cost.context_over_200k), size: 200000 }]
        : []
      : cost.tiers.map((tier) => ({ ...normalized(tier), size: tier.tier.size }));
  return { ...normalized(cost), tiers: tiers.toSorted((a, b) => a.size - b.size) };
}
function merge(base: Price | null, override: Price | null): Price | null {
  if (!override) return base;
  const tiers = new Map(base?.tiers.map((tier) => [tier.size, tier]));
  for (const tier of override.tiers) tiers.set(tier.size, tier);
  return { ...override, tiers: [...tiers.values()].toSorted((a, b) => a.size - b.size) };
}
export function catalogModels(catalog: Catalog): ReadonlyMap<string, CatalogModel> {
  const models = new Map<string, CatalogModel>();
  const modes = new Map<string, CatalogModel>();
  for (const [providerId, provider] of Object.entries(catalog.body)) {
    for (const [modelId, model] of Object.entries(provider.models)) {
      const id = `${provider.id ?? providerId}/${model.id ?? modelId}`;
      const name = model.name ? `${model.name} · ${provider.name ?? providerId}` : modelId;
      const base = price(model.cost);
      models.set(id, { name, price: base });
      for (const [mode, options] of Object.entries(model.experimental?.modes ?? {})) {
        modes.set(`${id}-${mode}`, {
          name: model.name
            ? `${model.name} ${mode.charAt(0).toUpperCase()}${mode.slice(1)} · ${provider.name ?? providerId}`
            : `${modelId}-${mode}`,
          price: merge(base, price(options.cost)),
        });
      }
    }
  }
  // Exact catalog entries beat expanded aliases, independent of JSON order.
  return new Map([...modes, ...models]);
}
