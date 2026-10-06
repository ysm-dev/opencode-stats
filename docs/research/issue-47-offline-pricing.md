# Offline estimated cost (#47)

Read #47, #11, #13, #16 and #27, including their comments. No personal database, transcript or measured spend was used or committed.

## Verified source shapes

OpenCode's supported 2.0.22 source is pinned at [`d259ae716379a67bcc35943ba75590f1fc7a1b26`](https://github.com/anomalyco/opencode/tree/d259ae716379a67bcc35943ba75590f1fc7a1b26).

- [`models-dev.ts`](https://github.com/anomalyco/opencode/blob/d259ae716379a67bcc35943ba75590f1fc7a1b26/packages/core/src/models-dev.ts): the `models-dev:catalog` KV value is `{ updatedAt, digest?, body }`, where `body` is a JSON string of provider/model maps. The cache writer hashes the raw API response with SHA-256. Provider/model `id` and display `name` are catalog fields. Named modes use `${model.id}-${mode}`, append the capitalized mode to the display name, inherit base tiers and replace matching mode thresholds. Omitted cache rates normalize to zero; a missing mode override inherits its base tariff.
- [`session/usage.ts`](https://github.com/anomalyco/opencode/blob/d259ae716379a67bcc35943ba75590f1fc7a1b26/packages/core/src/session/usage.ts): context is input + cache read + cache write; the highest threshold **strictly below** that context wins. Reasoning is added to visible output before multiplying by the output rate. Rates are USD per million tokens.
- [`session-message.ts`](https://github.com/anomalyco/opencode/blob/d259ae716379a67bcc35943ba75590f1fc7a1b26/packages/schema/src/session-message.ts): assistant `cost` is an optional USD number, separate from optional token usage.
- [`models.dev's generator`](https://github.com/sst/models.dev/blob/56f1a18a93b4decb74e6b94b92d835b267c7ad9b/packages/core/src/generate.ts#L247-L289): `context_over_200k` can represent a threshold **above** 200k. Exact `cost.tiers` must take precedence, even if its array is empty.

The specified public API, `https://models.opencode.ai/api.json`, was fetched for the snapshot. At refresh it contained 226 providers and 8,416 models; recognized costs included exact context tiers, legacy context aliases, cache prices and named modes. Its additional reasoning/audio price fields do not alter the issue's explicit reasoning-at-output policy.

## Implementation decisions

- A single strict trust-boundary parser handles both cached wrapper JSON and the committed snapshot wrapper. Known fields must have their expected types; rates must be finite and non-negative. Unrelated catalog capabilities/request settings are discarded. A malformed source catalog is rejected and falls back to the snapshot, without modifying OpenCode.
- The snapshot keeps provider/model keys, base token tariffs and `experimental.modes.*.cost`, not display names or capability metadata. Cached catalogs supply display names; with a prices-only snapshot the label falls back to the model ID. The committed wrapper records fetch time and the original API response's SHA-256 digest. The resulting snapshot is about 835 KB; this API has grown since the issue's approximate size was recorded.
- No provider substitution, variant-based tariff guessing or historical pricing. Exact entries beat synthesized mode aliases, independent of catalog order. Explicit zero tariffs remain priced; missing prices or incomplete token usage remain NULL, rather than guessed zeros.
- The stats store keeps normalized tariffs for encountered models and their current catalog provenance. New steps are priced during their fact commit. A moved KV row is read again; normalized price changes rewrite only that model's steps. Names, per-step estimates and catalog provenance commit atomically. Name-only or fetch-time-only changes leave fact revisions alone. Restart also detects changed snapshot prices even when OpenCode's timestamp did not move.
- Recorded cost never enters the estimate. Priced share is token-weighted over all five recorded token kinds, not a share of steps; no tokens gives an unavailable share. No priced steps gives an unavailable estimated total. A priced zero-token step can still have a zero estimate.
- Cost and its previous-period change are part of the engine's complete state. The headline uses the existing marked headline component; visible `≈` has an accessible “about” equivalent. Native title, history flushing and focus handling are unchanged.

## Verification hand-off

Synthetic public-seam cases cover boundaries, out-of-order tiers, empty exact tiers, legacy aliases, mode inheritance/overrides/collisions, zero and absent rates, incomplete usage, malformed catalogs, catalog removal, price-only/name-only updates, unchanged timestamps and restart. Generated updates compare incremental sync to a fresh build and to independent tariff arithmetic. Engine reference properties cover filtered ranges, missing facts and token-weighted pricing; dashboard tests exercise real-engine comparisons and marked live replacements. Binary properties carry fractional/null costs and reject invalid values.

Only dependency installation (scripts disabled), snapshot refresh, formatting and schema/fingerprint generation ran locally. **No local CI gate or test ran.** Hosted gates must establish coverage, lint/types, duplication, contracts, release and packed behavior. Store 7 and format 6 are reserved; integration after #46 must regenerate the combined statements and both fingerprints, retaining its tool facts without introducing tool metrics here.
