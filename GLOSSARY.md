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

### Data

**OpenCode database**:
The single database OpenCode v2 writes, located the same way OpenCode locates it unless explicitly overridden. The dashboard's only source of truth, and never written to.
_Avoid_: source DB, the DB, `opencode.db` (only one of its possible filenames)

**Stats store**:
opencode-stats' own derived data, built from the OpenCode database and rebuildable from it at any time.
_Avoid_: index, mirror, cache

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
