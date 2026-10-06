import type { SyntheticMessage } from "./database.ts";

export const pricedTokens = {
  input: 100,
  cache: { read: 200, write: 300 },
  output: 400,
  reasoning: 500,
};
export const pricedMessage = (id: string, model: string, seq = 0): SyntheticMessage => ({
  id,
  session: "pricing",
  seq,
  start: seq + 1000,
  provider: "p",
  model,
  tokens: pricedTokens,
  cost: 0.123,
});
export const cachedCatalog = (body: object, updatedAt = 1, digest?: string) =>
  JSON.stringify({ updatedAt, digest, body: JSON.stringify(body) });
export const rate = (input = 1, output = 2, cache_read = 3, cache_write = 4) => ({
  input,
  output,
  cache_read,
  cache_write,
});
export const tier = (size: number, input = 10) => ({
  ...rate(input),
  tier: { type: "context", size },
});
export const priceCatalog = (input = 1, name = "Synthetic Model") => ({
  p: {
    id: "p",
    name: "Synthetic Provider",
    models: {
      m: { id: "m", name, cost: rate(input) },
      stable: { name: "Stable", cost: rate(0) },
    },
  },
});
