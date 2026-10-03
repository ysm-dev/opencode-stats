# opencode-stats

A local, read-only dashboard of one person's OpenCode usage, served either by OpenCode as a plugin or on its own. This glossary holds that domain's language, plus the quality-gate and package vocabulary inherited from the template.

## Language

### Product

**Dashboard**:
The read-only web UI that presents statistics drawn from the OpenCode database.
_Avoid_: app (OpenCode's own web UI), web UI, site

**Plugin mode**:
opencode-stats loaded by OpenCode from its plugin configuration, so the dashboard comes up alongside OpenCode.
_Avoid_: embedded mode, integrated mode

**Standalone mode**:
opencode-stats launched on its own, without OpenCode loading it.
_Avoid_: CLI mode, server mode

**Dashboard server**:
The opencode-stats process that serves the dashboard and keeps the stats store in sync, apart from OpenCode's own processes. At most one runs per user: plugin mode starts it in the background, standalone mode runs it in a terminal.
_Avoid_: service (OpenCode's background service), sidecar, daemon, backend

**Launcher**:
The part of opencode-stats that OpenCode loads in plugin mode. It only starts or joins the dashboard server and keeps it running while its OpenCode process runs.
_Avoid_: plugin (the whole package), loader, starter

**Contribution graph**:
A grid of the past year's local days, one cell per day, shaded by how much of the chosen metric that day holds.
_Avoid_: heatmap, activity calendar, calendar

**Page**:
One of the dashboard's six destinations: Overview, Models, Projects, Agents, Tools and Sessions. Every page shows the same time range and filters.
_Avoid_: view, tab, screen, report

**Problem screen**:
The full-window screen shown instead of the dashboard when there is nothing to show yet or a page can't be drawn, saying what is wrong and what to do.
_Avoid_: error page, page (one of the six destinations), fallback, splash

**Headline number**:
A metric the Overview page leads with, shown beside its change from the previous period.
_Avoid_: KPI, stat, tile, card

### Data

**OpenCode database**:
The single database OpenCode v2 writes, located the same way OpenCode locates it unless explicitly overridden. The dashboard's only source of truth, and never written to.
_Avoid_: source DB, the DB, `opencode.db` (only one of its possible filenames)

**Stats store**:
opencode-stats' own derived data about one OpenCode database, built from it and rebuildable from it at any time.
_Avoid_: index, mirror, cache

**Fact**:
A step, tool call, prompt, session or subagent session as opencode-stats has counted it, with its moments and dimensions. The stats store holds facts, and every number on the dashboard is worked out from them.
_Avoid_: record (the dashboard server's record is a file), row, event

**Build**:
Filling a new stats store from the OpenCode database, newest history first: the first build for an OpenCode database, or a rebuild after an opencode-stats release changes how the stats store counts or is laid out.
_Avoid_: import, indexing, migration, sync (sync keeps a stats store current; a build fills a new one)

**Browser copy**:
The complete copy of a stats store's facts that each open dashboard tab holds and works out every page from.
_Avoid_: cache, snapshot, local database, dataset

**Not updating**:
The state of a dashboard tab whose numbers have stopped following the OpenCode database: sync has stopped, or the tab has lost its dashboard server.
_Avoid_: frozen, stale, offline, paused

### Activity

**Session**:
A conversation in OpenCode started by its user rather than by a subagent, forks included. The steps of its subagent sessions, however deeply nested, also belong to it.
_Avoid_: conversation, chat, thread, root session

**Subagent session**:
A conversation a subagent started from within a session or another subagent session. Counted apart from sessions.
_Avoid_: child session, subtask, task

**Fork**:
A session started from a copy of another session's history. The copy remains the origin's activity: a fork's own activity is only what happens after it.
_Avoid_: branch, clone, duplicate

**Prompt**:
A user message delivered to a session, belonging to the provider, model, variant and agent of the first step after it. Messages in subagent sessions and OpenCode's synthetic messages are not prompts.
_Avoid_: user message, message, query, request

**Step**:
One round of the agent loop: a request to the model, its response, and the tool calls that response made. OpenCode records each one as an assistant message.
_Avoid_: assistant message, message, turn, request, generation

**Failed step**:
A step that ended with an error other than an interruption.
_Avoid_: error, errored step

**Interrupted step**:
A step the user stopped before it finished.
_Avoid_: aborted step, cancelled step, error

**Tool**:
A capability a step can call, such as `read`, `shell` or an MCP server's tool. Known by its current OpenCode name: calls recorded as `bash`, `task` or `apply_patch` belong to `shell`, `subagent` and `patch`.
_Avoid_: function, command, action

**Tool call**:
One use of a tool by a step. It shares its step's moment and dimensions.
_Avoid_: tool use, invocation, action

**Outcome**:
How a tool call ended: succeeded, failed, or stopped (interrupted or refused by the user).
_Avoid_: status, result

**Project**:
A repository, or a folder outside any repository, as OpenCode identifies it. A session is in one project at a time, and all its steps belong to the project it is in now.
_Avoid_: repo, workspace (an OpenCode workspace is something else), directory

**Provider**:
The service a model is reached through, such as `anthropic`, `openai` or `opencode-go`.
_Avoid_: vendor, platform, gateway

**Model**:
A provider and a model ID together, such as `openai/gpt-5.6-luna`. The same model ID through another provider is a different model.
_Avoid_: model ID (on its own), engine

**Variant**:
The reasoning or request setting a step ran its model with, such as `high` or `max`; a step that recorded none ran `default`. Kept apart from the model.
_Avoid_: mode (a named mode such as `-pro` is part of the model ID), effort, level

**Agent**:
The OpenCode agent a step ran as, such as `build`, `plan` or `explore`: the one recorded on the step, not the session's current choice.
_Avoid_: mode, persona, assistant

**Dimension**:
A property metrics are filtered and broken down by. Steps have project, provider, model, variant, agent and session; tool calls add tool.
_Avoid_: attribute, facet, category, group

**Filter**:
The values of a dimension the dashboard is narrowed to. Values of one dimension combine as any-of and dimensions as all-of; a tool filter narrows tool calls only.
_Avoid_: facet, query, scope

### Metrics

**Tokens**:
Everything a step's model read and wrote, across five kinds: input, cache read, cache write, output and reasoning.
_Avoid_: usage, total tokens

**Input**:
Tokens sent to the model that were neither read from nor written to its cache.
_Avoid_: prompt tokens, uncached input

**Output**:
Tokens the model wrote, not counting its reasoning.
_Avoid_: completion tokens, generated tokens

**Context size**:
The tokens a step sent to the model: its input, cache read and cache write together.
_Avoid_: context window (the model's limit), context usage, prompt size

**Estimated cost**:
What a step's tokens would cost at its model's current list price. Always labelled as an estimate.
_Avoid_: spend, API cost, value

**Recorded cost**:
The cost OpenCode recorded for a step when it ran. Zero for subscriptions and for models OpenCode had no price for, so not what was billed.
_Avoid_: actual cost, billed cost, spend

**Cache hit rate**:
The share of the tokens sent to the model that were read from its cache.
_Avoid_: cache ratio, cache efficiency, hit ratio

**Response time**:
How long a step took, from sending its request to the model's last streamed token.
_Avoid_: latency, duration, speed, time to first token (never recorded)

**Run time**:
How long a tool call ran, from starting to run until it finished.
_Avoid_: duration, execution time, latency

**Active day**:
A local day with at least one step.
_Avoid_: working day, contribution day

**Streak**:
A run of consecutive active days. The current streak ends today, or yesterday while today has no steps yet.
_Avoid_: chain, run

### Time

**Local day**:
A calendar day in the browser's current timezone, from one local midnight to the next. A daylight-saving change makes it 23 or 25 hours long.
_Avoid_: date, UTC day, 24 hours

**Start of history**:
The moment the dashboard counts from: the OpenCode database's first activity, or the start of today when it has none. While a build hasn't read back that far, it is the start of the earliest local day from which the build has read everything.
_Avoid_: first activity (only one of its cases), cutoff, horizon

**Time range**:
The span of time the dashboard is showing: either a preset or a fixed range.
_Avoid_: period, window, timeframe, date range

**Preset**:
A named time range that ends now and moves with the clock: Today; the 7, 30, 90, 180 or 365 local days ending today; or All time.
_Avoid_: rolling window, relative range, quick range

**Fixed range**:
A time range pinned to particular local days, reached by drilling into a bucket or shifting another range. It never moves with the clock.
_Avoid_: custom range, absolute range

**Shift**:
Moving a time range to its neighbour of the same kind: the next or previous day, week, calendar month, or run of the same number of local days.
_Avoid_: step (a step is an assistant step), page, scroll

**Previous period**:
The time range shifted back once, cut at the same point while the current range is still running. Headline numbers are compared against it.
_Avoid_: prior period, last period, comparison range

**Bucket**:
One interval of a time-series chart: an hour, a local day, a week (Monday to Sunday) or a month.
_Avoid_: bin, interval, period

### Enforcement

**Gate**:
A single automated check that blocks a merge when it fails. There are eight, listed in `README.md`.
_Avoid_: rule, check, lint (a lint rule is one implementation of a gate, not a synonym)

**Silent false pass**:
A gate that exits 0 while enforcing nothing, usually because its inputs failed to resolve. The failure mode this template is designed around, and the reason `verify-gates` exists.
_Avoid_: false negative, silent failure

**Exception**:
A named, reasoned, human-approved waiver of one gate for one path. Lives in `quality-exceptions.json` when it covers a whole file, or as an inline suppression carrying `-- <reason>` when it covers a single line.
_Avoid_: ignore, suppression, disable, override, waiver

**Tier**:
Where a gate runs: pre-commit, pre-push, or CI. Tiers exist because gates differ by orders of magnitude in cost, not because they differ in importance.
_Avoid_: stage, level, phase

### Structure

**Archetype**:
One of the two shapes a workspace package may take. A **library** is consumed by other workspace packages; an **application** is the thing that runs.
_Avoid_: kind, category, template (overloaded here), project

**Just-in-Time package**:
A workspace package whose `exports` points at TypeScript source, with no build step and no emitted `dist/`. The only package shape this template supports.
_Avoid_: source package, unbuilt package, internal package

**Trust boundary**:
A function that accepts untrusted input as `unknown` and narrows it before anything downstream sees it. The only place `unknown` may be declared, and the only accepted justification for suppressing the `unknown` ban.
_Avoid_: validator, parser, guard (a type guard is a tool used at a trust boundary, not the boundary itself)
