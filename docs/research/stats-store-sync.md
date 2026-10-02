# Stats-store first build and per-session sync costs

Research for [“What is the stats store, and how does it stay in sync?” (#16)](https://github.com/ysm-dev/opencode-stats/issues/16). Measured 2026-10-02. This reports measurements, not the design decision.

## Direct answer

**A complete first build took 14.640 s median with a 50 ms read-transaction target**, including assistant steps, tool calls, user prompts, session/project metadata, dictionaries, indexes and the final stats-store checkpoint. The unbatched baseline took 17.601 s median. These are three process-fresh trials each with uncontrolled/warm OS cache, not disk-cold estimates.

- Warm change discovery is small: aggregate sequences **0.873 ms**, session metadata **2.804 ms**, and the covering-index message summary **15.960 ms** median (n=20 each). The latter touches every transcript index entry, not every JSON payload.
- Re-extracting the ten largest sessions (754–1413 messages) took **12.927–37.096 ms** warm medians; their last five transcript rows took **0.023–0.214 ms**. First executions were materially slower; see the table rather than treating warm results as a bound.
- On the fixed sample, the JSONB-input variant added **3.23%** to ordinary json_each's median time. Both returned exactly the same 4435 scalar-only tool facts. This Apple SQLite build rejects jsonb_each, despite reporting 3.51.0.

## First-build measurements

| Pass / target | Total wall, median / p95 / max s (n=3) | File MB, min–max      | Peak RSS MiB, min–max |
| ------------- | -------------------------------------- | --------------------- | --------------------- |
| baseline      | 17.601 / 35.165 / 35.165               | 95.526912–95.526912   | 875.906–1071.484      |
| 25            | 14.960 / 17.957 / 17.957               | 112.386048–112.386048 | 459.422–470.781       |
| 50            | 14.640 / 14.925 / 14.925               | 112.386048–112.386048 | 476.328–481.609       |
| 100           | 14.496 / 15.796 / 15.796               | 112.386048–112.386048 | 476.938–487.141       |

Wall time starts before opening the source and ends after checkpointing the **derived store only**, verifying its aggregate counts and closing both connections. Setup/preparation, dictionary encoding, JS materialization, stats inserts and index maintenance are included. Logging and writing benchmark-report JSON are excluded. File sizes are actual post-checkpoint bytes expressed in decimal MB; RSS uses MiB. The baseline and newest-first files have the same facts/schema but different insertion orders and resulting B-tree layout/fill; their sizes are not interchangeable. Rows are not reduced to numeric placeholders: the store retains source IDs, titles, project names/worktrees and dictionary strings privately.

| Target ms / trial | Source read transactions n | Source p50 / p95 / max ms   | Store write transactions n | Store p50 / p95 / max ms | Read > target n | Peak RSS MiB |
| ----------------- | -------------------------- | --------------------------- | -------------------------- | ------------------------ | --------------- | ------------ |
| 25 / 1            | 599                        | 25.514 / 30.092 / 273.799   | 599                        | 2.058 / 9.392 / 16.847   | 597             | 459.422      |
| 25 / 2            | 495                        | 25.382 / 29.918 / 251.971   | 495                        | 2.623 / 10.055 / 16.912  | 493             | 461.766      |
| 25 / 3            | 324                        | 25.206 / 26.776 / 62.060    | 324                        | 3.646 / 11.122 / 32.426  | 322             | 470.781      |
| 50 / 1            | 250                        | 50.617 / 56.012 / 177.778   | 250                        | 5.055 / 14.303 / 20.888  | 248             | 476.328      |
| 50 / 2            | 250                        | 50.596 / 56.589 / 283.791   | 250                        | 4.979 / 14.884 / 52.062  | 248             | 476.766      |
| 50 / 3            | 172                        | 50.433 / 53.770 / 284.768   | 172                        | 6.886 / 15.714 / 19.580  | 170             | 481.609      |
| 100 / 1           | 127                        | 100.978 / 110.221 / 138.453 | 127                        | 10.550 / 20.972 / 24.772 | 125             | 476.938      |
| 100 / 2           | 136                        | 101.276 / 113.042 / 409.989 | 136                        | 9.394 / 20.471 / 27.434  | 134             | 485.844      |
| 100 / 3           | 104                        | 100.790 / 104.229 / 505.134 | 104                        | 12.258 / 25.617 / 33.940 | 102             | 487.141      |

Transaction statistics cover the explicitly timed initial covering-index/session/project metadata read transaction and the metadata write transaction. The separate startup metadata read spanned **24.109–505.135 ms** across nine batched builds. Fact units numbered 26,009 / 18,018 / 14,684, splitting 3,166 / 1,827 / 927 sessions for the 25/50/100 ms targets respectively. Largest individual unit times across the three trials were **56.949 / 45.787 / 65.979 ms** respectively. The read-over-target count is for fact batches only; the separately measured metadata startup read can also exceed a target. A final empty read transaction can occur when the last fact unit triggers a flush. One additional autocommit scalar lookup of the newest assistant created timestamp precedes metadata: its cost is in total wall time but was not separately timed or included in these transaction distributions (add one source statement to each reported count). These are **soft time targets**, checked after each bounded seq unit, not a claim that SQL can be preempted at an exact deadline.

### When recent ranges became complete

All ranges mean strictly younger than 1/7/30/90/365 × 86,400,000 ms relative to the newest assistant step in this frozen clone, using the assistant's allowlisted created timestamp, not the dashboard's local-calendar day. A range-complete time is the commit of its **last matching assistant step**, measured retrospectively after the complete build; tools/prompts from that unit are committed together. It does not assert the application could certify completeness at that instant without a source frontier.

| Target ms | 1 day, median / p95 / max s | 7 days                | 30 days               | 90 days                 | 365 days                 |
| --------- | --------------------------- | --------------------- | --------------------- | ----------------------- | ------------------------ |
| 25        | 1.350 / 1.445 / 1.445       | 4.586 / 5.147 / 5.147 | 5.884 / 7.213 / 7.213 | 9.774 / 12.127 / 12.127 | 14.794 / 17.779 / 17.779 |
| 50        | 1.240 / 1.428 / 1.428       | 4.509 / 4.699 / 4.699 | 5.747 / 6.038 / 6.038 | 9.584 / 9.754 / 9.754   | 14.490 / 14.728 / 14.728 |
| 100       | 1.255 / 1.735 / 1.735       | 4.387 / 4.876 / 4.876 | 5.658 / 6.145 / 6.145 | 9.439 / 9.918 / 9.918   | 14.340 / 15.621 / 15.621 |

For comparison, the conservative **session frontier** can certify a range when a completed session is committed and the next session's latest message is at/below the cutoff. It may wait for old rows in an otherwise recent session; it does not use a JSON scan to calculate the initial ordering.

| Target ms | 1-day frontier, median / p95 / max s | 7 days                | 30 days               | 90 days                 | 365 days                 |
| --------- | ------------------------------------ | --------------------- | --------------------- | ----------------------- | ------------------------ |
| 25        | 1.350 / 1.445 / 1.445                | 4.586 / 5.147 / 5.147 | 5.884 / 7.213 / 7.213 | 9.774 / 12.127 / 12.127 | 14.794 / 17.779 / 17.779 |
| 50        | 1.240 / 1.428 / 1.428                | 4.509 / 4.699 / 4.699 | 5.747 / 6.038 / 6.038 | 9.584 / 9.754 / 9.754   | 14.490 / 14.728 / 14.728 |
| 100       | 1.255 / 1.735 / 1.735                | 4.387 / 4.876 / 4.876 | 5.658 / 6.145 / 6.145 | 9.439 / 9.918 / 9.918   | 14.340 / 15.621 / 15.621 |

| Pass / target | Trial 1 wall s | Trial 2 wall s | Trial 3 wall s | Final stats checkpoint median / p95 / max ms (n=3) |
| ------------- | -------------- | -------------- | -------------- | -------------------------------------------------- |
| baseline      | 35.165         | 17.601         | 16.142         | 2.218 / 6.664 / 6.664                              |
| 25            | 17.957         | 14.960         | 9.885          | 3.038 / 7.483 / 7.483                              |
| 50            | 14.640         | 14.925         | 10.380         | 5.681 / 7.960 / 7.960                              |
| 100           | 14.496         | 15.796         | 12.464         | 7.172 / 7.205 / 7.205                              |

Later trials were often much faster, especially assistant extraction and the baseline's user-row scan. OS-cache/load drift is large enough that the small differences between the three target medians should not be treated as an independently isolated target-size effect.

### Build breakdown and baseline

The following are elapsed time **inside each extraction family**, summed per trial, then summarized median / p95 / max across three trials, in seconds. Stats writes are separate, and include dictionary inserts/index maintenance/commits. Metadata includes the ordering query plus sessions/projects. Index-range discovery includes the per-session index-only seq lists. Remaining wall time includes connection/schema setup, statement preparation, buffering, housekeeping and the final checkpoint; phases need not sum exactly to total.

| Pass / target | Steps                   | Tools                   | Prompts               | Metadata              | Seq lists             | Store writes          |
| ------------- | ----------------------- | ----------------------- | --------------------- | --------------------- | --------------------- | --------------------- |
| baseline      | 5.982 / 15.975 / 15.975 | 9.526 / 13.553 / 13.553 | 0.938 / 4.231 / 4.231 | 0.213 / 0.527 / 0.527 | 0.000 / 0.000 / 0.000 | 0.870 / 0.898 / 0.898 |
| 25            | 7.581 / 10.467 / 10.467 | 5.050 / 5.059 / 5.059   | 0.120 / 0.134 / 0.134 | 0.252 / 0.274 / 0.274 | 0.135 / 0.187 / 0.187 | 1.623 / 1.697 / 1.697 |
| 50            | 7.560 / 7.717 / 7.717   | 4.955 / 5.042 / 5.042   | 0.090 / 0.094 / 0.094 | 0.284 / 0.285 / 0.285 | 0.134 / 0.150 / 0.150 | 1.441 / 1.536 / 1.536 |
| 100           | 7.586 / 8.594 / 8.594   | 5.014 / 5.051 / 5.051   | 0.081 / 0.083 / 0.083 | 0.410 / 0.505 / 0.505 | 0.166 / 0.168 / 0.168 | 1.348 / 1.409 / 1.409 |

| Baseline trial | Unbatched statement durations p50 / p95 / max ms (n=4) | Write duration p50 / p95 / max ms (n=2) | Peak RSS MiB |
| -------------- | ------------------------------------------------------ | --------------------------------------- | ------------ |
| 1              | 4230.703 / 15974.509 / 15974.509                       | 11.328 / 826.914 / 826.914              | 1061.094     |
| 2              | 938.473 / 9526.449 / 9526.449                          | 12.144 / 885.729 / 885.729              | 875.906      |
| 3              | 598.240 / 9134.052 / 9134.052                          | 11.379 / 858.463 / 858.463              | 1071.484     |

Baseline: one whole-source assistant statement, one whole-source tool statement, one whole-source user statement, plus metadata; each fully materializes its allowed scalar results. It then inserts all facts in one stats-store write transaction. There is no source-wide explicit transaction surrounding those statements, but each long statement holds its own read snapshot until consumed. It extracts and stores the same facts/schema as batched trials. The earlier **16.16 s** figure was steps-only, a different snapshot (191,946 vs 194295 steps), a multi-path JSON-array projection and different fact encoding/indexes: this is not a controlled regression comparison. [R2]

### Final store rows and schema

| Table      | Rows (identical across all 12 regular builds) |
| ---------- | --------------------------------------------- |
| steps      | 194295                                        |
| tool_calls | 301308                                        |
| prompts    | 18655                                         |
| sessions   | 13025                                         |
| projects   | 159                                           |
| provider   | 12                                            |
| model      | 108                                           |
| variant    | 7                                             |
| agent      | 20                                            |
| tool       | 40                                            |
| error_type | 13                                            |

The clone has **13025 sessions**, **12605 sessions with messages**, **221995 transcript messages**, **159 projects** and **13044 aggregate sequence rows**. Aggregate sequences are not identical to the set of extant sessions. Only assistant, tool and delivered user facts are in this experiment; synthetic/system/shell/compaction/etc. messages are not reclassified as user prompts or assistant steps. Usage outside assistant steps remains outside these timings. [R1]

## Change-discovery costs

The prepared data_version warm median / p95 / max is **1.250 / 1.917 / 2.750 µs** (n=20); the table uses milliseconds.

Milliseconds; one first prepared execution followed by **20 warm repetitions** on the same read-only connection. Preparation is outside each timed interval; full scalar result materialization is inside. “First” is not disk-cold: metadata/schema probes and one aborted capability-check run preceded this successful probe, and OS cache was not flushed. No table row values, names, titles or timestamps are printed.

| Query         | Rows  | First ms | Warm median / p95 / max ms (n=20) |
| ------------- | ----- | -------- | --------------------------------- |
| dataVersion   | 1     | 0.012    | 0.001 / 0.002 / 0.003             |
| sequence      | 13044 | 18.450   | 0.873 / 1.225 / 1.314             |
| messageGroups | 12605 | 706.102  | 15.960 / 16.371 / 16.459          |
| sessions      | 13025 | 160.581  | 2.804 / 3.400 / 3.499             |
| projects      | 159   | 4.605    | 0.021 / 0.029 / 0.031             |
| catalog       | 1     | 126.698  | 0.074 / 0.088 / 0.248             |

The projects query reads **all project rows but only id/name/worktree**, not all columns. The session-discovery query includes time_updated as requested; the first-build store's session rows retain only id/parent_id/project_id/title/time_created/fork_session_id. The catalog probe selects only its timestamp, not catalog JSON. The data-version observation is on the unchanged clone and measures query cost, not change-detection latency. Values are meaningful only compared on the same connection. [S1]

Actual EXPLAIN QUERY PLAN output:

```text
SCAN session_message USING COVERING INDEX session_message_session_time_created_id_idx
SEARCH session_message USING COVERING INDEX session_message_session_seq_idx (session_id=?)
```

Both probes are **covering/index-only** according to the actual engine; covering means the requested columns are in the index, so no table/JSON lookup is necessary. [S2]

| Largest-session rank | Messages / returned rows | First ms | Index-only (session_id,seq) median / p95 / max ms (n=20) |
| -------------------- | ------------------------ | -------- | -------------------------------------------------------- |
| 1                    | 1413                     | 2.320    | 0.095 / 0.103 / 0.132                                    |
| 2                    | 1112                     | 1.275    | 0.076 / 0.088 / 0.791                                    |
| 3                    | 1053                     | 1.037    | 0.068 / 0.075 / 0.097                                    |
| 4                    | 956                      | 0.669    | 0.062 / 0.067 / 0.071                                    |
| 5                    | 918                      | 1.047    | 0.059 / 0.063 / 0.078                                    |
| 6                    | 913                      | 1.811    | 0.057 / 0.062 / 0.062                                    |
| 7                    | 878                      | 1.339    | 0.056 / 0.061 / 0.064                                    |
| 8                    | 870                      | 0.871    | 0.064 / 0.069 / 0.664                                    |
| 9                    | 785                      | 0.841    | 0.051 / 0.058 / 0.065                                    |
| 10                   | 754                      | 1.395    | 0.050 / 0.055 / 0.055                                    |

## Re-extracting a changed session

Prepared queries extract all assistant leaves, tool leaves and user row scalars for one session. An explicit BEGIN/COMMIT surrounds the three fully consumed reads. No store writes are included. Timings also include a small JS result-array flattening operation used to count derived rows. The tail means the last five **transcript rows of all types** by seq, not the last five assistants/tools; the fifth row's seq is found by the session-seq index. Whole-session and tail first executions are separately reported; the tail runs after whole-session warming.

Largest ten sessions by message count, not by JSON bytes. **20 warm repetitions per session per condition.** Counts below are steps / tool calls / user prompts.

| Rank | Messages | Derived counts   | Full first ms | Full median / p95 / max ms | Tail first ms | Tail median / p95 / max ms | Tail counts |
| ---- | -------- | ---------------- | ------------- | -------------------------- | ------------- | -------------------------- | ----------- |
| 1    | 1413     | 1349 / 1344 / 21 | 98.814        | 22.097 / 23.095 / 23.170   | 0.240         | 0.146 / 0.163 / 0.166      | 4 / 4 / 0   |
| 2    | 1112     | 769 / 698 / 54   | 186.746       | 12.927 / 13.218 / 13.420   | 0.105         | 0.083 / 0.088 / 0.088      | 4 / 3 / 0   |
| 3    | 1053     | 988 / 1658 / 26  | 71.206        | 33.508 / 35.166 / 35.525   | 0.150         | 0.109 / 0.114 / 0.115      | 5 / 5 / 0   |
| 4    | 956      | 895 / 914 / 23   | 99.137        | 37.096 / 38.276 / 38.355   | 0.090         | 0.040 / 0.052 / 0.060      | 3 / 1 / 1   |
| 5    | 918      | 761 / 984 / 28   | 235.018       | 18.710 / 19.077 / 19.365   | 0.042         | 0.023 / 0.024 / 0.026      | 2 / 1 / 0   |
| 6    | 913      | 891 / 1354 / 8   | 43.488        | 21.795 / 22.182 / 22.268   | 0.097         | 0.068 / 0.073 / 0.073      | 4 / 5 / 0   |
| 7    | 878      | 854 / 930 / 11   | 36.623        | 16.216 / 16.410 / 16.923   | 0.102         | 0.083 / 0.085 / 0.088      | 5 / 4 / 0   |
| 8    | 870      | 801 / 893 / 2    | 46.675        | 17.081 / 23.613 / 24.193   | 0.296         | 0.214 / 0.224 / 0.241      | 4 / 9 / 0   |
| 9    | 785      | 768 / 1088 / 9   | 51.739        | 22.507 / 23.963 / 24.029   | 0.103         | 0.076 / 0.081 / 0.085      | 5 / 4 / 0   |
| 10   | 754      | 734 / 882 / 8    | 36.416        | 14.980 / 15.847 / 15.940   | 0.115         | 0.090 / 0.102 / 0.109      | 5 / 5 / 0   |

The median message-bearing session has **5 rows**. The sample is ten deterministic sessions at exactly that size, ordered by session ID internally; IDs are not published. Here all five rows fit in the tail, so tail selection has no work reduction. Counts are 4 steps / 3 tools / 1 prompt for every sampled median-size session.

| Median-size sample | Messages | Full first ms | Full median / p95 / max ms | Tail first ms | Tail median / p95 / max ms |
| ------------------ | -------- | ------------- | -------------------------- | ------------- | -------------------------- |
| 1                  | 5        | 1.098         | 0.052 / 0.059 / 0.060      | 0.061         | 0.055 / 0.062 / 0.065      |
| 2                  | 5        | 1.178         | 0.093 / 0.099 / 0.103      | 0.100         | 0.094 / 0.100 / 0.100      |
| 3                  | 5        | 0.295         | 0.048 / 0.051 / 0.412      | 0.054         | 0.050 / 0.053 / 0.056      |
| 4                  | 5        | 0.522         | 0.057 / 0.062 / 0.062      | 0.063         | 0.059 / 0.062 / 0.064      |
| 5                  | 5        | 0.984         | 0.072 / 0.082 / 0.085      | 0.079         | 0.073 / 0.078 / 0.079      |
| 6                  | 5        | 0.126         | 0.063 / 0.068 / 0.069      | 0.068         | 0.066 / 0.069 / 0.070      |
| 7                  | 5        | 2.628         | 0.259 / 0.263 / 0.267      | 0.263         | 0.261 / 0.265 / 0.267      |
| 8                  | 5        | 1.190         | 0.085 / 0.088 / 0.090      | 0.090         | 0.088 / 0.089 / 0.091      |
| 9                  | 5        | 0.563         | 0.059 / 0.061 / 0.065      | 0.063         | 0.061 / 0.062 / 0.067      |
| 10                 | 5        | 1.070         | 0.065 / 0.068 / 0.069      | 0.069         | 0.067 / 0.070 / 0.071      |

These timings show the cost of **one** changed session, not the total cost of any arbitrary set of simultaneously active sessions, nor a guarantee about polling every 500 ms. Whole-session re-derivation correctly re-reads earlier rows; reading only a tail is a measured optimization, **not proof that older rows cannot change or disappear**. Sequence and timestamp lifecycle limitations remain as found in the field-map research. [R1, R3]

## Tool extraction: JSON vs JSONB

Fixed sample: **2,000 assistant rows**, selected by rowid order after offset 10,000, returning 4435 tools. Result order is message rowid then content-array ordinal. Each method had one first timed execution plus 20 warm repetitions, after a separate equality-check extraction. The complete returned scalar arrays were asserted equal, including missing/null values and tool identity/status/timings; no spend or content was compared outside its scalar allowlist.

| Method          | First ms | Median / p95 / max ms (n=20) |
| --------------- | -------- | ---------------------------- |
| json_each       | 80.090   | 68.377 / 71.975 / 72.778     |
| json_each_jsonb | 72.039   | 70.589 / 72.339 / 72.460     |

**Use ordinary json_each for the measured builds:** the JSONB-input variant added **2.211 ms (3.23%)** at the median. This is one sample/order, not universal superiority. jsonb_each would keep each child as JSONB and avoid text re-rendering in SQLite, but preparing it failed with “no such table: jsonb_each”; pragma_function_list also had no such function. Official upstream docs say it arrived in 3.51.0, so the reported Apple version alone is insufficient capability detection. No replacement SQLite library or extension was installed. [S3, B1]

## Environment, isolation and privacy

- **Apple M4, 16 GiB RAM**, arm64; macOS **26.6.2 (25G83)**, Darwin **25.6.0**, kernel xnu-12377.161.14~5/RELEASE_ARM64_T8132. Hardware from sysctl; OS from sw_vers/uname, hostname omitted.
- **Bun 1.4.2**, bun:sqlite engine **3.51.0**, measured by sqlite_version(). Installed OpenCode **v2.0.22**, from opencode --version. Clone migration count **48**. No claim that the installed executable has the exact source commit cited by prior field/lifecycle research.
- Timed work ran in separate Bun processes at **nice 10**, sequentially except the deliberate optional writer overlap. The machine remained in normal development use; initial load averages were **2.17 / 2.29 / 2.97** (1/5/15 min), and final averages were **2.11 / 2.22 / 2.42**. No CPU pinning, cache purge or exclusive-machine reservation. Repeated query/build p95/max values are empirical, not hard latency bounds.
- One new approved scratch directory held an APFS clone of the live main DB, WAL and SHM, copied in **one cp -c command**. Snapshot file bytes: **17762873344 / 3254832 / 32768**, respectively. The live file was **never opened by extraction**, checkpointed, vacuumed or tuned. All regular extraction used new Database(path,{readonly:true}), busy_timeout=100, query_only=ON. No source journal-mode/checkpoint/VACUUM command ran. WAL/shared-memory coordination on a read-only open is still normal SQLite locking, not an immutable file shortcut. [B1, S4]
- Sequential file cloning is **not an atomic SQLite backup**. This experiment successfully read the copied snapshot and independently cross-checked row counts across all builds; no full quick_check/integrity_check was run. Those checks could test structure, not prove a transaction-perfect live capture. [S5]
- SQLite only returns allowlisted scalar leaves and structural row identities/sequences/ordinals. Neither message data nor a complete content/tool object crosses into JS. User text/files, assistant text/reasoning, tool input/output/error messages and arbitrary project/session JSON are never selected. Titles, project names/worktrees and dictionary strings remain only in private scratch stores, never in logs/findings. Cost is retained privately as an allowed scalar for realistic rows; **no cost/spend figures are published**.
- No benchmark dependencies were installed. Existing repository dependencies were installed with the frozen lockfile in the scratch worktree only, after measurements, for quality checks. Throwaway scripts/data lived only in scratch, not packages or the commit. Each regular build used a fresh process and a new derived file; build order rotated (baseline/25/50/100; 100/50/25/baseline; 50/25/baseline/100). Derived dictionaries preserve NULL rather than using a missing-value string/code; model keys include provider code. IDs are retained, not hashes or fabricated short replacements. All store row counts matched across the 12 trials.
- Peak RSS is the Bun process high-water mark from process.resourceUsage().maxRSS × 1024, checked against process.memoryUsage().rss and macOS /usr/bin/time -l to establish KiB conversion. It includes runtime, SQLite caches, arrays, maps and GC, not just facts. No child process is part of a regular build.

## Methods sufficient to reproduce

1. Create a new approved scratch directory and clone .db/-wal/-shm together with the requested cp -c invocation. Never redirect the benchmark at the live file. Open the clone with the read-only Bun constructor; keep normal locking (no immutable/nolock/custom SQLite).
2. Prepare/run the discovery SQL below once, then 20 times; time performance.now() around .values(), after preparation. Use sorted nearest-rank quantiles, ceil(p*n)-1; median uses the lower middle observation for even n. Show the first observation separately. No timer subtraction.
3. Sort the covering-index groups by latest DESC, session_id as stable tie-breaker. Read session/project scalar metadata in the same initial read transaction and insert it into the fresh stats store. Count existing sessions even when they have no messages. No source time_created index or JSON rewriting is added.
4. For target T=25/50/100 ms, cap a seq unit at **floor(T/2) transcript rows: 12/25/50 rows**. Get each session's seq list with its covering index; split larger sessions by the actual seq values, not numeric gap width. Extract steps, tools and prompts for each inclusive seq range with three prepared statements. Session order stays newest-first; ranges within a session ascend by seq. Large sessions were therefore **split**, not read as one unbounded transaction.
5. Group units from consecutive sessions in an explicit source read transaction. After each unit, check elapsed wall time; at/above target, fully COMMIT the read, then insert all its buffered facts/dictionary entries in **one derived-store write transaction**, commit it, clear the buffer and begin the next source read. No source read snapshot is held across stats-store writing. The initial metadata transaction is separate. The source read transaction also includes JS unit buffering/count bookkeeping, not just SQL. The cap is an experimental batching parameter, not a proposed production constant. A single row/GC/scheduler pause can exceed the target; tables expose actual tails and overshoots. SQLite explains why reader gaps matter for WAL reset/checkpoint progress. [S4]
6. Baseline uses the same projections/schema with no session/range predicate, materializes three complete fact arrays and writes them in one fact transaction. Keep metadata writes separate in both modes. Build indexes before insertion for realistic per-insert index maintenance. Stats files use WAL, synchronous=NORMAL and default automatic checkpoint threshold (not disabled); finish with wal_checkpoint(TRUNCATE) **on the stats file only**. [S4]
7. Repeat each build three times in fresh Bun processes under nice -n 10; rotate target order. Assert the seq-list count equals its grouped session count, fact insert counts equal final table counts, all regular builds have identical counts, and each recent range has at least one observed step. Capture commit times for range completeness; track the completed-session frontier separately. Delete disposable clones and stores after publishing the one Markdown file.

### Essential discovery and extraction SQL

```sql
PRAGMA data_version;
SELECT aggregate_id,seq FROM event_sequence;
SELECT session_id,max(time_created) AS latest,count(*) AS n
FROM session_message GROUP BY session_id;
SELECT id,parent_id,project_id,title,time_created,time_updated,fork_session_id
FROM session_v2;
SELECT id,name,worktree FROM project;
SELECT time_updated FROM kv WHERE key='models-dev:catalog';
SELECT session_id,seq FROM session_message WHERE session_id=? ORDER BY seq;

SELECT m.id,m.session_id,m.seq,
  m.data ->> '$.model.providerID', m.data ->> '$.model.id',
  m.data ->> '$.model.variant', m.data ->> '$.agent',
  m.data ->> '$.tokens.input', m.data ->> '$.tokens.output',
  m.data ->> '$.tokens.reasoning', m.data ->> '$.tokens.cache.read',
  m.data ->> '$.tokens.cache.write', m.data ->> '$.cost',
  m.data ->> '$.time.created', m.data ->> '$.time.streamed',
  m.data ->> '$.time.completed', m.data ->> '$.error.type'
FROM session_message m
WHERE m.type='assistant' AND m.session_id=?1 AND m.seq BETWEEN ?2 AND ?3
ORDER BY m.seq;

SELECT m.id,m.session_id,m.seq,j.key,
  j.value ->> '$.id', j.value ->> '$.name',
  j.value ->> '$.state.status', j.value ->> '$.state.error.type',
  j.value ->> '$.time.created', j.value ->> '$.time.ran',
  j.value ->> '$.time.completed'
FROM session_message m,json_each(m.data,'$.content') j
WHERE m.type='assistant' AND j.value ->> '$.type'='tool'
  AND m.session_id=?1 AND m.seq BETWEEN ?2 AND ?3
ORDER BY m.seq,j.key;
-- JSONB comparison changes only the table-valued function argument to:
-- json_each(jsonb(m.data),'$.content')

SELECT m.id,m.session_id,m.seq,m.time_created
FROM session_message m
WHERE m.type='user' AND m.session_id=?1 AND m.seq BETWEEN ?2 AND ?3
ORDER BY m.seq;

-- Whole-session tests omit BETWEEN; tail adds this instead:
-- AND m.seq >= coalesce((SELECT seq FROM session_message
-- WHERE session_id=?1 ORDER BY seq DESC LIMIT 1 OFFSET 4),-1)
-- Baseline omits both session and seq predicates.

```

### Exact derived-store schema

Surrogate IDs/codes, epoch timestamps and token counts below are INTEGER; source identities/status/dictionary values are TEXT, and recorded cost is REAL. No metric defaults hide missing values. Unique/index definitions affect measured bytes and write costs; this is an experimental fixture, not a finalized stats-store contract.

```sql
CREATE TABLE projects(code INTEGER PRIMARY KEY,source_id TEXT UNIQUE,name TEXT,worktree TEXT);
CREATE TABLE sessions(code INTEGER PRIMARY KEY,source_id TEXT UNIQUE,parent_id TEXT,project INTEGER,title TEXT,created INTEGER,fork_session_id TEXT);
CREATE TABLE provider(code INTEGER PRIMARY KEY,value TEXT UNIQUE);
CREATE TABLE model(code INTEGER PRIMARY KEY,provider INTEGER,value TEXT,UNIQUE(provider,value));
CREATE TABLE variant(code INTEGER PRIMARY KEY,value TEXT UNIQUE);
CREATE TABLE agent(code INTEGER PRIMARY KEY,value TEXT UNIQUE);
CREATE TABLE tool(code INTEGER PRIMARY KEY,value TEXT UNIQUE);
CREATE TABLE error_type(code INTEGER PRIMARY KEY,value TEXT UNIQUE);
CREATE TABLE steps(id INTEGER PRIMARY KEY,source_id TEXT UNIQUE,session INTEGER,seq INTEGER,provider INTEGER,model INTEGER,variant INTEGER,agent INTEGER,input INTEGER,output INTEGER,reasoning INTEGER,cache_read INTEGER,cache_write INTEGER,cost REAL,created INTEGER,streamed INTEGER,completed INTEGER,error_type INTEGER);
CREATE TABLE tool_calls(id INTEGER PRIMARY KEY,message_id TEXT,session INTEGER,seq INTEGER,ordinal INTEGER,call_id TEXT,tool INTEGER,status TEXT,error_type INTEGER,created INTEGER,ran INTEGER,completed INTEGER,UNIQUE(message_id,ordinal));
CREATE TABLE prompts(id INTEGER PRIMARY KEY,source_id TEXT UNIQUE,session INTEGER,seq INTEGER,created INTEGER);
CREATE INDEX steps_created ON steps(created);
CREATE INDEX steps_session_seq ON steps(session,seq);
CREATE INDEX steps_dimensions ON steps(provider,model,agent,created);
CREATE INDEX tools_session_seq ON tool_calls(session,seq);
CREATE INDEX tools_created ON tool_calls(created);
CREATE INDEX prompts_session_seq ON prompts(session,seq);
CREATE INDEX prompts_created ON prompts(created);
```

## Optional writer experiment

A **separate disposable APFS clone of the original clone plus both sidecars** was opened writable for this experiment only. One Bun writer at nice 10 updated a single event_sequence row with seq=seq+1 every 50 ms, 1,200 commits per condition (~60 s), WAL, synchronous=NORMAL, busy_timeout=5000, default wal_autocheckpoint=1000. Only that clone was mutated; no message JSON was selected or changed. The no-build condition ran first, then a 50 ms-target build opened the same optional clone **read-only** and ran concurrently in another nice-10 Bun process. Its stats store was a different file. Writer timings surround the single autocommit UPDATE statement, therefore include the small indexed update plus commit, not an isolated COMMIT syscall. WAL size is sampled after each commit, not a claim about live frames/complete checkpointing.

| Condition (n=1 run each) | Autocommit update+commit median / p95 / max ms (n=1200) | WAL initial / max / end bytes |
| ------------------------ | ------------------------------------------------------- | ----------------------------- |
| without                  | 0.198 / 0.268 / 6.328                                   | 0 / 4120032 / 824032          |
| with                     | 0.101 / 0.254 / 6.650                                   | 0 / 4120032 / 824032          |

Scheduling lateness median / p95 / max ms: without **1.308 / 2.004 / 2.715**; with **1.319 / 1.972 / 3.831**. The writer reused its clone across conditions, so initial WAL size/state and cache differ; one run each is not a repeatable live-writer-impact guarantee. In the instrumented repeat, the concurrent build lasted **24.334 s**. Its **488 overlapping commits** had median / p95 / max **0.026 / 0.054 / 1.658 ms**; the remaining 712 commits after it ended had **0.206 / 0.261 / 6.650 ms**. Overlap is marked by the parent observing child-process exit; the first commit can precede the actual source open by a few milliseconds. The whole-condition table includes both intervals, so use the overlapping subset for the specific reader-overlap cost.

An earlier exploratory run used the same 1,200-commit conditions but did not separate the overlap interval: without **0.191 / 0.267 / 714.488 ms**, with **0.085 / 0.251 / 5.394 ms**. Its writer began with a 3254832-byte copied WAL, reached 4120032 bytes and had a **714.488 ms** maximum; the with-build condition began at 0 bytes and peaked at 4120032. That outlier is not suppressed or attributed to the reader. The first concurrent build took **27.314 s**, not a controlled throughput comparison with warm regular builds. The instrumented repeat reused the clone again (no fresh private-data extraction), and both conditions began with an empty WAL. Across the two without/with trials, whole-condition medians ranged **0.191–0.198 / 0.085–0.101 ms** respectively. No competing checkpointer, second writer or content-heavy updates were simulated.

## Limitations

One person's snapshot and one macOS machine, not every session size/content shape or Linux/Windows. Nice 10 reduces scheduling priority, not a CPU quota or “no noticeable impact” proof. Process-fresh trials have warm/uncontrolled filesystem cache; no cold-disk result. No actual dashboard/browser snapshot serialization, HTTP transfer, chart render, steady-state upsert/delete reconciliation or end-to-end freshness measurement. The tests read frozen facts rather than a real streaming model; session JSON size and tool-output size can dominate independently of message count. Tails/sequence scans are performance facts, not correctness cursors; row rewrites, copies/imports and deletes need the lifecycle contract in prior research. Short source reads reduce one cause of WAL starvation but do not prove a live writer is unaffected. No application design decision is made here.

## Primary sources and related findings

- **Measured primary evidence:** local Bun/SQLite experiments, exact SQL/schema and clock boundaries in this file; successful equality/count assertions. No private data or throwaway benchmark artifact is committed.
- **S1:** [SQLite PRAGMA data_version](https://www.sqlite.org/pragma.html#pragma_data_version): same-connection comparisons and external commits.
- **S2:** [SQLite EXPLAIN QUERY PLAN §1.1](https://www.sqlite.org/eqp.html#table_and_index_scans): covering/index-only interpretation.
- **S3:** [SQLite JSON §3.7 and §4.24](https://www.sqlite.org/json1.html): JSONB processing, scalar ->> behavior, jsonb_each vs json_each child representation and upstream 3.51.0 introduction.
- **S4:** [SQLite WAL §§2.2,2.3,3.1,5,6](https://www.sqlite.org/wal.html): read snapshots/checkpoint progress, NORMAL, automatic checkpointing, read-only sidecars and reader gaps. The source reader issues no checkpoint/journal-mode change.
- **S5:** [SQLite corruption guidance §1.2](https://www.sqlite.org/howtocorrupt.html): risks of copying an in-use database and journals independently.
- **B1:** [Bun SQLite documentation](https://bun.com/docs/runtime/sqlite): synchronous driver, native readonly flag, result consumption, macOS system SQLite and persistent sidecars.
- **R1:** [OpenCode field/lifecycle research](https://github.com/ysm-dev/opencode-stats/blob/research/opencode-database-fields/docs/research/opencode-database-fields.md), with first-party OpenCode sources pinned to 8433dd732fb2c9cd6b3e79e6161e9c0b3dc83e43: allowlisted paths and lifecycle meanings, not inferred from this benchmark.
- **R2:** [Prior extraction/store measurements](https://github.com/ysm-dev/opencode-stats/blob/research/duckdb-next-frame/docs/research/duckdb-next-frame.md): 16.16 s steps-only median and 18.02 MB steps-only fixture.
- **R3:** [Database/read-only/change-signal research](https://github.com/ysm-dev/opencode-stats/blob/research/database-location-and-changes/docs/research/database-location-and-changes.md), including pinned first-party writer/bus/projector sources: read-only rules and why aggregate sequences are not a global change log.
