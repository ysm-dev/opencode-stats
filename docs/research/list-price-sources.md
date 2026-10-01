# List-price sources for API-equivalent estimates

Research for [#11](https://github.com/ysm-dev/opencode-stats/issues/11), under [map #1](https://github.com/ysm-dev/opencode-stats/issues/1). Measured 2026-10-01. This is research, not a decision to implement an estimator.

## Direct answer

- **Use a versioned, local models.dev provider catalog.** OpenCode v2 already stores one in the **OpenCode database**, in `kv.value` at `key = 'models-dev:catalog'`. Read it directly, read-only; do not invoke OpenCode's catalog service, which refreshes and writes. An opencode-stats-shipped snapshot would provide a reliable offline floor in both **plugin mode** and **standalone mode**. OpenCode itself embeds such a snapshot. [Catalog implementation][oc-catalog]; [KV storage][oc-kv].
- **Current-catalog coverage is 98.71% of all steps and 98.26% of zero-recorded-cost steps** after resolving the one used named model mode. Exact provider/model lookup alone covers 98.13% and 97.47%, respectively. This measures price availability, not invoice accuracy or completeness of usage. Current catalog prices cover 88.89% of distinct provider/model/variant combinations and 84.11% of provider/model pairs. The measured bundled OpenCode source snapshot has the same coverage. See measurement and inventory below.
- **The old `~/.cache/opencode/models.json` is a weaker fallback:** 88.14% of steps after mode resolution. Its 99 leftover temporary snapshots plus the current and old main catalogs collectively contain prices for 99.93% of steps and 99.93% of zero-cost steps. These leftovers are opportunistic evidence, not a supported history interface or something production should scan.
- **Preserve explicit zero prices separately from missing prices.** Current catalog coverage includes 4,541 steps on explicitly zero-priced offerings. Positive list-price records cover 96.34% of all steps and 95.05% of zero-recorded-cost steps. A free endpoint's zero rate is not a paid API-equivalent rate for its underlying model; any cross-provider comparison needs an explicit, sourced mapping and its own label.
- **History is observations, not effective-dated billing.** models.dev exposes the current catalog; its repository history and locally retained snapshots can recover older price observations, including removed models, but do not establish exactly when those prices applied to an account. Store catalog digest, observation time, mapping, tier and estimation policy in the **stats store** if estimates are adopted; label the **dashboard** value “estimated API-equivalent cost,” never actual spend. [API documentation][md-readme]; [endpoint implementation][md-worker].
- **Zero recorded cost does not classify billing.** OpenCode computes from normalized tokens and the runtime model's prices; missing prices, absent usage, genuine zero prices and subscription overrides can all yield zero. ChatGPT connections explicitly erase prices, whereas OpenCode Go can record positive token-valuations despite being a subscription. A historical step does not record a billing-mode explanation or price schedule. [Usage calculation][oc-cost]; [OpenAI override][oc-openai]; [Go pricing][go-pricing]; [assistant schema][oc-assistant].
- **Two essential estimator caveats:** prefer exact `cost.tiers` over the legacy `context_over_200k` alias; and do not silently turn an absent cache/reasoning price into verified free usage. The current OpenCode importer loads both tier representations and can apply a higher-threshold price too early. Its recorded-cost calculation prices reasoning as output. [Tier generation][md-tiers]; [catalog normalization][oc-normalize]; [usage calculation][oc-cost].

## Sources and offline access

### 1. OpenCode v2's database catalog

At inspected OpenCode commit `8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43` on branch `v2`:

- `KVTable` is the `kv` table, with JSON stored as text in `value`; the node KV service reads and overwrites it in the OpenCode database. [Table][oc-kv-table]; [service][oc-kv].
- Default upstream is `https://models.opencode.ai/api.json`. Cache key is `models-dev:catalog`; a custom source has `models-dev:catalog:<hash>`. The stored wrapper is `{ updatedAt, digest?, body }`, where `body` is a JSON **string** encoding the provider-keyed catalog. Decode the outer JSON, then the inner string. `updatedAt` is a fetch/cache observation, not a price-effective timestamp. [Cache shape and key][oc-catalog].
- Startup precedence is explicit catalog file → database cache → bundled snapshot → network fetch if enabled. Background refresh checks a five-minute TTL, requests the catalog with a ten-second timeout and transient retries, and skips writing/re-publishing an identical body. Therefore `updatedAt` need not advance on every poll. A stale cache remains useful offline. [Loading and refresh][oc-refresh].
- On this machine the key existed, with a 5,955,767-byte outer value and a 5,282,116-byte raw catalog body: 225 providers / 8,341 models. Its `updatedAt` was `2026-10-01T07:41:46.845Z`; body SHA-256 was `01ee4afc0b13a3221d7a0682bc859e464021837f38bdb93fcd7c8be26e72b860`. Both public endpoints fetched during research returned that same digest. These are local measurements, not a permanent promise that the domains stay identical.

The narrow read is:

```sql
SELECT value FROM kv WHERE key = 'models-dev:catalog';
```

Only that catalog wrapper should be decoded, not arbitrary KV/credential records. Raw prices remain useful even if OpenCode later disables a deprecated model or replaces its runtime pricing for an OAuth connection. OpenCode's catalog plugin excludes deprecated runtime models; an estimator for past usage should not apply that availability filter. [Filtering][oc-catalog-plugin].

### 2. Bundled catalogs and the older filesystem cache

OpenCode imports `packages/core/src/models-dev/snapshot.txt` as text, decodes it once per isolate, and uses it as a boot-time floor. Its maintenance script fetches the same upstream and checks that at least 100 providers exist before writing the file. This is **embedded code**, not a promised extractable file beside an installed executable. The snapshot measured here is from the inspected source checkout; the exact snapshot embedded in the installed binary was not extracted or verified. [Bundling][oc-catalog]; [update script][oc-update].

Measured source snapshot: 5,264,592 bytes, 225 providers / 8,324 models, SHA-256 `2600f80042b331f939e7ce56fc4333620cae208098a9d987db343242f862c74e`; same used-model coverage as the current cache, not byte-identical.

Observed `~/.cache/opencode/models.json` is plain provider-keyed JSON, 4,643,800 bytes, 213 providers / 7,789 models, filesystem modification date 2026-09-15. Digest: `d58b1091bfa91f5b1518e93338b088c6ba43877a18154cde6104aea35f218020`. The inspected v2 catalog implementation does **not** use or refresh this path. Its original writer/refresh contract was not verified; do not assume its modification date proves price validity. The 99 parseable `models.json.*.tmp` files have modification dates from June 7 through September 8, 2026. Leave the original files untouched.

models.dev also publishes `@opencode-ai/models`, whose SDK has an offline snapshot export containing `providers`, `models` and `generatedAt`. This is an alternative packaging source, not additional independently verified prices. The installed package's contents/coverage were not measured here. Use provider data (`api.json` or `catalog.providers`), not provider-agnostic `models.json`, to select prices. [README][md-readme]; [snapshot contract][md-snapshot].

### 3. Model definitions and configuration

The inspected database schema has no dedicated model/provider definition table. Assistant steps store `Model.Ref` plus optional cost/tokens, **not** the effective model definition or unit rates. The catalog KV value is the verified persistent price source. Runtime models have `cost: Cost[]`, but their definitions are not step-time pricing snapshots. [Assistant schema][oc-assistant]; [model schema][oc-model].

OpenCode v2 config can define `providers[provider].models[model].cost` as one price record or an array: input, output, optional cache read/write, and optional context threshold. It can also map a model ID or canonical provider. Config application replaces a model's cost when supplied. Config variants contain request overlays, not independent cost fields. [Config schema][oc-config]; [config application][oc-config-apply].

The standard global location holds `opencode.json`/`opencode.jsonc`; explicit and project-level sources can override it. [V2 configuration guide][oc-config-docs]; [discovery][oc-config-discovery]. The one observed global config contained 17 model definitions and **zero price overrides**: 0% price coverage from that file. Project-specific or historical configs were not surveyed; treating today's config as the explanation of an old step would be unverified.

Provider plugins can change runtime prices: OpenAI/ChatGPT plan connections set `cost = []`; Copilot can derive USD-per-million rates from its authenticated models response; OpenCode Console can overlay remotely fetched provider config. These are runtime/account-specific inputs, not necessary or safe offline catalog APIs for opencode-stats to invoke. No Copilot assistant steps were present in this measurement. [OpenAI][oc-openai]; [ChatGPT][oc-chatgpt]; [Copilot][oc-copilot]; [Console][oc-console].

## Measured coverage

### Definitions and reproducibility

An APFS clone of the live OpenCode database, WAL and SHM was made in the ticket's approved scratch directory. SQLite was opened with `mode=ro`; no live-database writes or checkpoints were performed. Copying three active files separately is not an atomic cross-file snapshot; results describe the successfully read research clone, not a guaranteed exact instant of live activity. Clones were removed after research. No message content was selected or exported.

The aggregate query grouped only assistant-step model references and counted whether numeric usage categories were present. The denominator is **192,027 assistant steps, 140,606 with recorded cost exactly zero (73.22%), 107 provider/model pairs, 180 provider/model/variant combinations, and 12 providers**. `NULL` variant is kept distinct from the literal `default`. The completed cold-clone query, with the additional cache/reasoning/context counts, took 198.55 seconds; that is not a benchmark of a lean stats-store sync.

Essential query shape (the executed query also counted numeric usage categories; never selected `content`):

```sql
SELECT json_extract(data, '$.model.providerID') AS provider,
       json_extract(data, '$.model.id') AS model,
       json_extract(data, '$.model.variant') AS variant,
       count(*) AS steps,
       sum(coalesce(json_extract(data, '$.cost'), -1) = 0) AS zero_steps
FROM session_message WHERE type = 'assistant'
GROUP BY 1, 2, 3;
```

“Price exists” means an actual input/output `cost` record exists, including explicitly zero-valued records; a model entry alone is insufficient. No fuzzy matching or substitution across providers was used. Mode resolution expands only catalog-declared `experimental.modes` into OpenCode's `${model.id}-${mode}` IDs and inherits/overrides base prices. The only used derived ID is `openai/gpt-5.6-sol-pro` (1,120 steps). [Mode expansion and merging][oc-modes]; [authored definition][md-sol]. Coverage does not certify that every token category, modality, tariff or usage report is complete.

| Source / lookup policy                                              | Combinations     | All steps covered        | Zero-cost steps covered  |
| ------------------------------------------------------------------- | ---------------- | ------------------------ | ------------------------ |
| Current database catalog, exact only                                | 159/180 (88.33%) | 188,429/192,027 (98.13%) | 97.47%                   |
| Current database catalog + declared modes                           | 160/180 (88.89%) | 189,549/192,027 (98.71%) | 98.26%                   |
| OpenCode source bundle + modes                                      | 160/180 (88.89%) | 98.71%                   | 98.26%                   |
| models.dev API + modes, fetched during research                     | 160/180 (88.89%) | 98.71%                   | 98.26%                   |
| models.opencode.ai API + modes, fetched during research             | 160/180 (88.89%) | 98.71%                   | 98.26%                   |
| Older main `models.json`, exact only                                | 140/180 (77.78%) | 87.56%                   | 83.82%                   |
| Older main `models.json` + modes                                    | 141/180 (78.33%) | 169,261/192,027 (88.14%) | 84.62%                   |
| Union of 99 older temporary snapshots + modes                       | 142/180 (78.89%) | 168,165/192,027 (87.57%) | 85.12%                   |
| All observed local catalogs, opportunistic union                    | 169/180 (93.89%) | 191,893/192,027 (99.93%) | 140,504/140,606 (99.93%) |
| Current + official GPT-5.2-Codex price + official Gemma free tariff | 163/180 (90.56%) | 190,264/192,027 (99.08%) | 98.77%                   |
| Observed global configuration                                       | 0/180 (0%)       | 0%                       | 0%                       |

The final supplementation row adds 706 GPT-5.2-Codex steps and nine Gemma steps, not guessed aliases. OpenAI still documents GPT-5.2-Codex at **$1.75 input / $0.175 cached input / $14 output per million tokens** despite its absence from the measured current catalog. Google documents both exact Gemma IDs and a free-only input/output/context-cache tariff, with no paid tier. These rates could be captured locally for offline use; consulting a website on each dashboard request is unnecessary. [OpenAI][official-codex]; [Gemma IDs][official-gemma]; [Google pricing, Gemma 4 section][official-google-pricing].

Current coverage by recorded provider, including declared modes:

| Provider         | Steps  | Price-covered combinations | Step coverage |
| ---------------- | ------ | -------------------------- | ------------- |
| anthropic        | 90,439 | 32/32                      | 100%          |
| openai           | 86,358 | 37/38                      | 99.18%        |
| opencode-go      | 9,528  | 38/45                      | 82.77%        |
| opencode         | 4,618  | 39/42                      | 97.99%        |
| google           | 1,038  | 4/6                        | 99.13%        |
| cursor-acp       | 17     | 0/2                        | 0%            |
| azure            | 12     | 6/6                        | 100%          |
| vercel           | 7      | 3/4                        | 71.43%        |
| openai-search    | 4      | 0/1                        | 0%            |
| openrouter       | 4      | 0/2                        | 0%            |
| gmi-cloud-custom | 1      | 0/1                        | 0%            |
| meta             | 1      | 1/1                        | 100%          |

**Do not discard old entries:** local older snapshots recover `openai/gpt-5.2-codex`, `opencode-go/{ox-alpha-free,glm-5.1,omen-alpha}`, `openrouter/{minimax/minimax-m3:free,stealth/ox-alpha}` and `vercel/minimax/minimax-m3-free`. Their validity on any particular step date remains unverified. No observed local catalog prices the remaining 134 steps: `opencode/union-alpha` (92), `cursor-acp/{auto,grok}` (17), `opencode-go/muse-spark-1.2` (8), the two Google Gemma IDs (9), `openai-search/gpt-5-search-api` (4), `opencode-go/deepseek-flash` (2), `gmi-cloud-custom/MiniMaxAI/MiniMax-M3` (1), and `opencode/jev-1.13-free` (1). The official Gemma tariff resolves nine of those; other exact alias/routing identities are **unverified**, not necessarily free. An `auto` route especially does not identify a single priced model.

### Cache, reasoning, variants and context tiers

- 177,766 steps have cache-read tokens. An explicit current-catalog `cache_read` rate exists for 175,638 of those (**98.80%**). 90,840 steps have cache-write tokens; an explicit `cache_write` rate exists for 90,827 (**99.99%**). These are presence-weighted step counts, not token-weighted coverage. Optional absent fields remain unknown/not-applicable until provider semantics establish which; OpenCode's importer instead defaults them to zero. [Normalization][oc-normalize].
- 95,304 steps have reasoning tokens. None of the used current entries declares the optional `cost.reasoning` field (**0% separately specified reasoning-price coverage**). The output price is available for 93,859 of these steps (**98.48%**); OpenCode charges `output + reasoning` at that output rate. The catalog schema supports separate reasoning rates but OpenCode's runtime cost schema does not. [models.dev schema][md-schema]; [OpenCode schema][oc-model]; [calculation][oc-cost]. Do not double-count reasoning by adding it to a provider's unsplit total output; the stored OpenCode fields are already visible output versus reasoning. [Token normalization][oc-cost].
- `high`, `max`, `xhigh`, `default`, `none`, etc. are reasoning/request variants, not standalone price IDs. All observed variants are inventoried below; they share their model's price lookup. This is price availability, not proof that an old variant is still supported. Named price-affecting modes such as `-fast` or `-pro` are a separate generated model-ID mechanism; only `-pro` was observed here. [Variant schema][oc-model]; [modes][oc-modes].
- Twenty used provider/model pairs have explicit context tiers. Relevant thresholds include **200,000, 256,000, 272,000 and 512,000** tokens (Google/Grok, Qwen, OpenAI, MiniMax, respectively). Tier selection requires each step's **input + cache read + cache write**, not session totals or only uncached input. Choose the largest threshold strictly exceeded, then apply its entire price record to the step. [Calculation][oc-cost]; [raw current API][md-api].
- **Verified compatibility trap:** models.dev generates `context_over_200k` when there is a single context tier at **any threshold ≥ 200k**, explicitly saying `cost.tiers` carries the exact threshold. OpenCode's importer adds both `tiers` and a new hard-coded 200k tier from that alias. Consequently a GPT model whose true tier starts above 272k can be valued by OpenCode at the elevated rate already above 200k. For a list-price estimator, use `tiers` when present and use `context_over_200k` only when `tiers` is absent. Matching OpenCode's recorded calculation is expressly not the dashboard's goal. [Generator][md-tiers]; [importer][oc-normalize]; [GPT-6.1 definition][md-sol61].

## Recorded cost and classification limits

OpenCode normalizes usage to nonnegative finite numbers: uncached input, visible output, reasoning, cache-read input and cache-write input. It chooses the context tier as above and records:

```text
(input × input_price
 + (output + reasoning) × output_price
 + cache_read × cache_read_price
 + cache_write × cache_write_price) / 1,000,000
```

No matching price yields zero; non-finite rates contribute zero. A completed step uses the resolved runtime model cost array, not a fetched invoice total. [Normalization and calculation][oc-cost]; [step recording][oc-step].

There is no reliable two-way split of historical zeros into “free” and “not billed per token” from the supplied step fields alone:

| Evidence                                                     | Safe interpretation                                                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Recorded zero + exact explicitly zero tariff                 | Zero list price in that observed catalog; historical free status still needs effective-date evidence    |
| Recorded zero + verified ChatGPT runtime connection          | Subscription override is a known mechanism; the historical step does not retain that connection proof   |
| Recorded zero + positive catalog price                       | API-equivalent valuation is possible when usage is present; reason for recorded zero is not established |
| Missing rate/model, missing usage, or unfinished/failed step | Unknown/unavailable estimate, not a free step                                                           |

Current auth/config cannot prove old authentication. Anthropic zeros in this dataset cannot be definitively attributed to subscriptions from the inspected first-party step schema/code, so their exact cause is **unverified**. Nor does positive recorded cost prove a cash charge: Go's official docs describe a subscription and allowance accounting in model token prices, with optional balance fallback. [Go][go-pricing].

## History and estimation policy caveats

models.dev's authored pricing is TOML under `providers/<provider>/models/<model>.toml`; commits are usable price observations. Its API worker serves generated current catalog assets and has no documented as-of/history selector. `release_date` and `last_updated` are model metadata, not effective start/end fields for each rate. A local cache is overwritten, not an append-only series. Thus exact historical tariffs and account-specific discounts are **not verified** by those sources. [README][md-readme]; [schema][md-schema]; [worker][md-worker]; [KV overwrite][oc-kv].

If adopted, an estimate should retain its catalog provenance and remain separate from recorded cost, even when recorded cost is nonzero. Missing prices should stay visibly unknown rather than silently summed as zero. Treat offline startup as an explicit snapshot policy; neither plugin mode nor standalone mode should depend on authenticated provider requests to display an estimate.

The catalog schema covers context-size tiers and optional modality rates, not every billing dimension. A scalar step token summary cannot reconstruct separate image/audio rates, search/tool fees, cache-storage time, promotional/account discounts or a service-tier choice not encoded by the model/mode. **Rate presence is not 98.71% invoice fidelity.** Provider Go documentation additionally supplies peak/off-peak DeepSeek rates absent from the catalog's single base price; a timestamp-aware rule would need independently versioned semantics, not an unconditional off-peak estimate. [Schema][md-schema]; [Go tariff][go-pricing]; [assistant usage fields][oc-assistant].

## Complete observed model/variant inventory

Every distinct combination is listed once as `variant: step count`, grouped by provider/model. `∅` means SQL NULL; it is not `default`. `P` means positive input/output/cache list-price record; `Z` means explicit zero-valued record; `—` means no price record. `P*` is the declared `-pro` mode, not an exact catalog model key. Current = database cache, both fetched APIs and inspected OpenCode source bundle (identical availability on these IDs); Legacy = old main `models.json`; Older = any of 99 temporary snapshots. The global config has no prices for any row. Provider-official supplementation is limited to GPT-5.2-Codex and the two Gemma IDs described above.

| Provider         | Model                              | Variants: step counts                                                           | Current | Legacy | Older |
| ---------------- | ---------------------------------- | ------------------------------------------------------------------------------- | ------- | ------ | ----- |
| anthropic        | claude-fable-5                     | max: 1,597; high: 428; default: 4                                               | P       | P      | P     |
| anthropic        | claude-fable-5-1                   | max: 321; default: 2; high: 1                                                   | P       | P      | P     |
| anthropic        | claude-opus-4-5                    | default: 1,422                                                                  | P       | P      | P     |
| anthropic        | claude-opus-4-5-20251101           | default: 27                                                                     | P       | P      | P     |
| anthropic        | claude-opus-4-6                    | default: 13,070; max: 8,396; high: 31; low: 6                                   | P       | P      | P     |
| anthropic        | claude-opus-4-7                    | max: 11,839; default: 2,602; xhigh: 688                                         | P       | P      | P     |
| anthropic        | claude-opus-4-8                    | max: 9,332; default: 165; xhigh: 22                                             | P       | P      | P     |
| anthropic        | claude-opus-5                      | max: 9,340; default: 48                                                         | P       | P      | P     |
| anthropic        | claude-opus-5-5                    | max: 4,152; default: 26                                                         | P       | —      | —     |
| anthropic        | claude-sonnet-4-5                  | default: 152                                                                    | P       | P      | P     |
| anthropic        | claude-sonnet-4-6                  | max: 3,464; default: 2,962                                                      | P       | P      | P     |
| anthropic        | claude-sonnet-5                    | max: 19,224; xhigh: 63; high: 52; default: 51; medium: 2                        | P       | P      | P     |
| anthropic        | claude-sonnet-5-5                  | max: 943; default: 7                                                            | P       | —      | —     |
| azure            | claude-opus-4-6                    | default: 6; max: 1                                                              | P       | P      | P     |
| azure            | claude-sonnet-4-5                  | default: 2                                                                      | P       | P      | P     |
| azure            | claude-sonnet-5                    | max: 1                                                                          | P       | P      | P     |
| azure            | gpt-image-2                        | default: 1                                                                      | P       | P      | P     |
| azure            | grok-4-20-reasoning                | default: 1                                                                      | P       | P      | P     |
| cursor-acp       | auto                               | default: 16                                                                     | —       | —      | —     |
| cursor-acp       | grok                               | default: 1                                                                      | —       | —      | —     |
| gmi-cloud-custom | MiniMaxAI/MiniMax-M3               | default: 1                                                                      | —       | —      | —     |
| google           | gemini-3.1-pro-preview-customtools | default: 902; high: 118                                                         | P       | P      | P     |
| google           | gemini-3.5-flash                   | high: 2                                                                         | P       | P      | P     |
| google           | gemini-3.6-flash                   | high: 7                                                                         | P       | P      | P     |
| google           | gemma-4-26b-a4b-it                 | high: 3                                                                         | —       | —      | —     |
| google           | gemma-4-31b-it                     | high: 6                                                                         | —       | —      | —     |
| meta             | muse-spark-1.2-contributor         | xhigh: 1                                                                        | P       | P      | P     |
| openai           | gpt-5.2-codex                      | default: 706                                                                    | —       | —      | P     |
| openai           | gpt-5.3-codex                      | xhigh: 3,757; default: 3,687; high: 52                                          | P       | P      | P     |
| openai           | gpt-5.4                            | xhigh: 4,293; default: 548; high: 2                                             | P       | P      | P     |
| openai           | gpt-5.5                            | xhigh: 18,852; default: 999                                                     | P       | P      | P     |
| openai           | gpt-5.5-pro                        | xhigh: 1                                                                        | P       | P      | P     |
| openai           | gpt-5.6                            | xhigh: 2                                                                        | P       | P      | P     |
| openai           | gpt-5.6-luna                       | max: 5,256; xhigh: 1,929; ∅: 302; medium: 276; high: 29; default: 15            | P       | P      | P     |
| openai           | gpt-5.6-sol                        | high: 13,308; xhigh: 7,137; max: 2,112; default: 37; medium: 5; low: 4; none: 1 | P       | P      | P     |
| openai           | gpt-5.6-sol-pro                    | xhigh: 1,120                                                                    | P*      | P*     | P*    |
| openai           | gpt-5.6-terra                      | medium: 101; xhigh: 1                                                           | P       | P      | P     |
| openai           | gpt-6-astra                        | high: 6,454; max: 179; xhigh: 76; default: 10                                   | P       | P      | P     |
| openai           | gpt-6-luna                         | max: 1,752; ∅: 99                                                               | P       | —      | —     |
| openai           | gpt-6-sol                          | high: 12,132; default: 2; low: 1                                                | P       | —      | —     |
| openai           | gpt-6.1-sol                        | high: 930; max: 191                                                             | P       | —      | —     |
| openai-search    | gpt-5-search-api                   | default: 4                                                                      | —       | —      | —     |
| opencode         | big-pickle                         | default: 4; high: 2                                                             | Z       | Z      | Z     |
| opencode         | deepseek-v4-flash-free             | max: 196; high: 9; default: 2                                                   | Z       | Z      | Z     |
| opencode         | glm-5-free                         | default: 5                                                                      | Z       | Z      | Z     |
| opencode         | gpt-5-nano                         | default: 2                                                                      | P       | P      | P     |
| opencode         | hy3-free                           | high: 62; default: 24                                                           | Z       | Z      | Z     |
| opencode         | hy3-preview-free                   | high: 1                                                                         | Z       | Z      | Z     |
| opencode         | jev-1.13-free                      | default: 1                                                                      | —       | —      | —     |
| opencode         | kimi-k2.5-free                     | default: 6                                                                      | Z       | Z      | Z     |
| opencode         | laguna-s-2.1-free                  | high: 7                                                                         | Z       | Z      | Z     |
| opencode         | ling-3.0-flash-fin-free            | high: 4                                                                         | Z       | Z      | Z     |
| opencode         | ling-3.0-flash-free                | high: 2                                                                         | Z       | Z      | Z     |
| opencode         | longcat-2.0-free                   | high: 1                                                                         | Z       | Z      | Z     |
| opencode         | longcat-2.5-preview-free           | default: 200                                                                    | Z       | —      | —     |
| opencode         | mimo-v2-pro-free                   | high: 2                                                                         | Z       | Z      | Z     |
| opencode         | mimo-v2.5-free                     | default: 30; high: 11                                                           | Z       | Z      | Z     |
| opencode         | mimo-v2.6-flash-free               | default: 1,095                                                                  | Z       | —      | —     |
| opencode         | minimax-m2.5-free                  | default: 79                                                                     | Z       | Z      | Z     |
| opencode         | minimax-m3-free                    | default: 1                                                                      | Z       | Z      | Z     |
| opencode         | muse-spark-1.2-contributor-free    | xhigh: 347; high: 6; default: 2                                                 | Z       | Z      | Z     |
| opencode         | muse-spark-1.3-contributor-free    | xhigh: 1,601; ∅: 432; default: 21; high: 9                                      | Z       | Z      | Z     |
| opencode         | nemotron-3-super-free              | high: 1                                                                         | Z       | Z      | Z     |
| opencode         | nemotron-3-ultra-free              | high: 3; default: 1                                                             | Z       | Z      | Z     |
| opencode         | nemotron-3.5-lightning-free        | default: 13                                                                     | Z       | Z      | Z     |
| opencode         | north-mini-code-free               | high: 5                                                                         | Z       | Z      | Z     |
| opencode         | qwen3.6-plus-free                  | default: 13                                                                     | Z       | Z      | Z     |
| opencode         | space-bunny-free                   | default: 1; max: 1                                                              | Z       | —      | —     |
| opencode         | union-alpha                        | default: 85; ∅: 7                                                               | —       | —      | —     |
| opencode         | x-preview-f-free                   | max: 322; default: 2                                                            | Z       | Z      | Z     |
| opencode-go      | deepseek-flash                     | max: 2                                                                          | —       | —      | —     |
| opencode-go      | deepseek-v4-flash                  | max: 1,432; default: 40                                                         | P       | P      | P     |
| opencode-go      | deepseek-v4-pro                    | max: 1,046; default: 43                                                         | P       | P      | P     |
| opencode-go      | deepseek-v4.1-flash                | max: 1,747; ∅: 43; default: 18                                                  | P       | P      | —     |
| opencode-go      | glm-5.1                            | default: 4                                                                      | —       | P      | P     |
| opencode-go      | glm-5.2                            | max: 2                                                                          | P       | P      | P     |
| opencode-go      | glm-5.3                            | max: 1                                                                          | P       | P      | P     |
| opencode-go      | glm-5.3-flash                      | max: 241; default: 7                                                            | P       | P      | P     |
| opencode-go      | gpt-5.6-luna                       | max: 859; ∅: 444; default: 25                                                   | P       | P      | P     |
| opencode-go      | gpt-6-luna                         | max: 178; ∅: 130                                                                | P       | —      | —     |
| opencode-go      | grok-4.5                           | high: 7                                                                         | P       | P      | P     |
| opencode-go      | hy3                                | high: 317; default: 3                                                           | P       | P      | P     |
| opencode-go      | kimi-k2.6                          | default: 947                                                                    | P       | P      | P     |
| opencode-go      | kimi-k3                            | max: 37                                                                         | P       | P      | P     |
| opencode-go      | longcat-2.0                        | high: 8                                                                         | P       | P      | P     |
| opencode-go      | longcat-2.5-preview-free           | default: 5                                                                      | Z       | —      | —     |
| opencode-go      | mimo-v2.5-pro                      | default: 9                                                                      | P       | P      | P     |
| opencode-go      | mimo-v2.6-flash                    | default: 57                                                                     | P       | —      | —     |
| opencode-go      | minimax-m2.7                       | default: 3                                                                      | P       | P      | P     |
| opencode-go      | minimax-m3                         | default: 3                                                                      | P       | P      | P     |
| opencode-go      | muse-spark-1.2                     | xhigh: 8                                                                        | —       | —      | —     |
| opencode-go      | muse-spark-1.2-contributor         | xhigh: 107; default: 3; high: 2                                                 | P       | P      | P     |
| opencode-go      | muse-spark-1.3-contributor         | xhigh: 1                                                                        | P       | P      | P     |
| opencode-go      | omen-alpha                         | high: 2                                                                         | —       | P      | P     |
| opencode-go      | ox-alpha-free                      | max: 1,531; default: 93; high: 2                                                | —       | Z      | Z     |
| opencode-go      | qwen3.6-plus                       | default: 101                                                                    | P       | P      | P     |
| opencode-go      | qwen3.7-max                        | default: 3                                                                      | P       | P      | P     |
| opencode-go      | qwen3.7-plus                       | default: 1                                                                      | P       | P      | P     |
| opencode-go      | qwen3.8-flash                      | max: 2                                                                          | P       | P      | P     |
| opencode-go      | qwen3.8-max                        | max: 1                                                                          | P       | P      | P     |
| opencode-go      | space-bunny-free                   | max: 12; default: 1                                                             | Z       | —      | —     |
| openrouter       | minimax/minimax-m3:free            | default: 2                                                                      | —       | —      | Z     |
| openrouter       | stealth/ox-alpha                   | max: 2                                                                          | —       | —      | Z     |
| vercel           | alibaba/qwen3.8-max-prime          | ∅: 1                                                                            | P       | —      | —     |
| vercel           | alibaba/qwen3.8-omni-flash         | ∅: 3                                                                            | P       | —      | —     |
| vercel           | google/gemini-3.8-live             | ∅: 1                                                                            | P       | —      | —     |
| vercel           | minimax/minimax-m3-free            | default: 2                                                                      | —       | —      | Z     |

## Primary-source references

OpenCode permalinks below refer to the inspected `v2` commit, not a moving branch. models.dev repository permalinks refer to inspected commit `56f1a18a93b4decb74e6b94b92d835b267c7ad9b`. Local measurements above are derived only from numeric fields and provider/model references; no databases, message content, account details or spend totals are committed.

[oc-catalog]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/models-dev.ts#L262-L305
[oc-refresh]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/models-dev.ts#L329-L436
[oc-normalize]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/models-dev.ts#L130-L164
[oc-modes]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/models-dev.ts#L102-L194
[oc-kv]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/kv.ts#L36-L58
[oc-kv-table]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/kv/sql.ts#L1-L9
[oc-update]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/script/update-models-snapshot.ts#L1-L24
[oc-catalog-plugin]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/plugin/models-dev.ts#L88-L110
[oc-model]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/schema/src/model.ts#L98-L160
[oc-assistant]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/schema/src/session-message.ts#L211-L236
[oc-config]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/schema/src/config/provider.ts#L47-L92
[oc-config-apply]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/config/plugin/provider.ts#L127-L154
[oc-config-discovery]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/config/discovery.ts#L11-L84
[oc-openai]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/plugin/provider/openai.ts#L273-L299
[oc-chatgpt]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/plugin/provider/chatgpt.ts#L281-L296
[oc-copilot]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/github-copilot/models.ts#L147-L187
[oc-console]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/plugin/provider/opencode.ts#L191-L306
[oc-cost]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/session/usage.ts#L8-L43
[oc-step]: https://github.com/anomalyco/opencode/blob/8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43/packages/core/src/session/runner/step.ts#L236-L249
[md-readme]: https://github.com/sst/models.dev/blob/56f1a18a93b4decb74e6b94b92d835b267c7ad9b/README.md
[md-schema]: https://github.com/sst/models.dev/blob/56f1a18a93b4decb74e6b94b92d835b267c7ad9b/packages/core/src/schema.ts
[md-tiers]: https://github.com/sst/models.dev/blob/56f1a18a93b4decb74e6b94b92d835b267c7ad9b/packages/core/src/generate.ts#L247-L289
[md-worker]: https://github.com/sst/models.dev/blob/56f1a18a93b4decb74e6b94b92d835b267c7ad9b/packages/function/src/worker.ts
[md-snapshot]: https://github.com/sst/models.dev/blob/56f1a18a93b4decb74e6b94b92d835b267c7ad9b/packages/sdk/src/snapshot.d.ts
[md-sol]: https://github.com/sst/models.dev/blob/56f1a18a93b4decb74e6b94b92d835b267c7ad9b/providers/openai/models/gpt-5.6-sol.toml
[md-sol61]: https://github.com/sst/models.dev/blob/56f1a18a93b4decb74e6b94b92d835b267c7ad9b/providers/openai/models/gpt-6.1-sol.toml
[md-api]: https://models.dev/api.json
[official-codex]: https://developers.openai.com/api/docs/models/gpt-5.2-codex
[official-gemma]: https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api
[official-google-pricing]: https://ai.google.dev/gemini-api/docs/pricing#gemma-4
[go-pricing]: https://opencode.ai/v2/docs/console/go/#usage-limits
[oc-config-docs]: https://opencode.ai/v2/docs/config/
