# Only a release bundles

The template's packages are Just-in-Time: they export TypeScript source and have no build step, because a package whose `exports` point at compiled output that hasn't been compiled makes type-aware lint and knip resolve nothing and exit 0. A release can't avoid compiling. The dashboard's Solid TSX must become JavaScript for browsers; the dashboard server runs under OpenCode's Bun with `--no-install` (ADR 0003), so nothing can be installed beside it; and only `opencode-stats` is published (ADR 0010), so the other six packages must travel inside it. So packages stay Just-in-Time, and one root script, `scripts/release.ts`, bundles them into a gitignored `.release/` folder and packs `opencode-stats` as one self-contained tarball with no dependencies. Nothing in the workspace ever imports a bundle. Three guards keep this from becoming a silent false pass: a check that every package's `exports`, `bin` and `types` point into its own `src/`; `.release/` on every gate's ignore list; and a smoke test of the packed tarball, installed the way OpenCode installs it, on every PR, since the gates check source while users run bundles.

## Considered Options

- **An entry in `quality-exceptions.json`.** It waives one gate for one path, and no gate is waived here; knip and tsc don't read it.
- **A bundle script in each package, run by Turborepo.** Where the launcher finds the server script and where the server finds the dashboard's files are one layout, which would be split across four packages.
- **Publishing every package as TypeScript source, with real dependencies.** Bun runs TypeScript from `node_modules`, but `opencode-stats` would have to depend on the dashboard server and so on Effect (ADR 0010), browsers can't run TSX, and in the Start spike a compiled Bun launcher couldn't resolve bare imports until the artifact bundled its dependencies.
- **OpenTUI and Solid as peer dependencies of `./tui`**, as OpenCode's publishing example declares them. OpenCode doesn't check them and its installer installs peers, so every install would download `@opentui/core`'s native packages, which OpenCode's own copies replace anyway.
- **Minified Bun-side bundles.** Smaller, but the log's stack traces would name renamed functions, even with source maps.

## Consequences

- AGENTS.md and README change from "no build step anywhere" to "no package exports compiled output; only a release bundles". No package has a `build` script, and the workspace `opencode-stats` package is private: only the `package.json` the release script generates is published.
- The tarball holds bundles only: the launcher, the `/dashboard` action and the bin, the dashboard server with its sync worker, and the dashboard's files, with generated third-party notices. They import only Bun and Node built-ins, except that `./tui` leaves `solid-js`, `@opentui/core`, `@opentui/solid` and `@opencode/plugin/tui` for OpenCode to supply: a bundled copy would give its footer a Solid that OpenCode doesn't drive.
- Bun's bundler neither follows `new Worker(new URL(...))` nor rewrites paths relative to `import.meta.url`, so each package names the files it reaches (the server script, the sync worker, the dashboard's files) in one module that the release script swaps for the bundled layout.
- The Bun-side bundles aren't minified and carry linked source maps, so the log's stack traces name our functions at their original lines (ADR 0011).
- The release script is tooling outside coverage, like `verify-gates.ts`: the smoke test of what it packs is its check.
- npm publishes the packed tarball from outside the repo: npm refuses to run inside it because the root's `devEngines` names Bun, and `bun publish` can't do trusted publishing or provenance.
