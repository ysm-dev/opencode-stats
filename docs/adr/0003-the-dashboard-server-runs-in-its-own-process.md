# The dashboard server runs in its own process

In plugin mode OpenCode loads opencode-stats into its background service, the compiled Bun executable that also runs the user's sessions, once for every project folder it opens and in every OpenCode process. The dashboard server, which serves the dashboard and builds and syncs the stats store (a first build is about 16 s of synchronous SQLite reads), never runs there. The plugin is only a launcher: it runs OpenCode's own executable as Bun (`BUN_BE_BUN=1`, which OpenCode itself uses for formatters and MCP servers) on the dashboard server's script, detached, with `--no-env-file`, an empty `--config` and `--no-install`; standalone mode runs the same program in a terminal. At most one dashboard server runs per user: it holds an exclusive SQLite lock on a file in opencode-stats' state folder, which the OS releases when the process dies, and publishes its address, version, OpenCode database and a secret in a record beside it. Each OpenCode process with the plugin keeps one hold, an open connection, on it, and it stops about 10 s after the last hold closes. This keeps our CPU, memory, garbage collection, crashes and Effect version out of OpenCode's sessions, and makes plugin mode and standalone mode one server.

## Considered Options

- **On OpenCode's main thread.** The first build's synchronous reads would freeze OpenCode unless cut into slices, and our garbage-collection pauses and crashes would be OpenCode's.
- **A worker thread inside OpenCode.** OpenCode stays responsive (its API answered within 21 ms during a 2 s busy loop in a worker), but our memory counts as OpenCode's, a native crash or running out of memory ends its running sessions, and OpenCode restarts the plugin, and the server with it, whenever an earlier plugin in its list changes.
- **A process tied to the OpenCode process that started it**, exiting when its stdin closes. Every exit of that process would leave the others without a dashboard for seconds while one of them started another.
- **A detached process that runs until reboot.** Plugin mode would outlive OpenCode, which is what standalone mode is for.
- **The port as the only lock.** The port is configurable, so a plugin and `bunx opencode-stats` set to different ports would run two dashboard servers writing one stats store.
- **A PID file, or `flock` through Bun's FFI.** Two starters can both find a PID file stale, and a reused PID makes a dead server look alive; Bun marks FFI experimental, and Windows has no `flock`.

## Consequences

- The plugin's server entry, the launcher, loads no Effect and no SQLite, and its `setup()` returns without waiting for the dashboard server. Before returning, it checks what it can see at once (its options, that OpenCode runs on Bun, and that the OpenCode database file exists) and fails setup when one is wrong: a failed setup is the one plugin problem OpenCode shows in both its TUI and Desktop.
- The `/dashboard` TUI action only joins a running dashboard server and never starts one: a TUI entry gets none of the plugin's options, so it can't know the port or the OpenCode database the launcher uses.
- Plugin mode depends on OpenCode's executable honouring `BUN_BE_BUN`. OpenCode relies on it too, and OpenCode Desktop's bundled executable honours it on macOS (2.0.22); Linux and Windows are not yet verified. A daily check runs plugin mode against the newest OpenCode on Linux and macOS, and against Desktop's executable on macOS.
- Without those three flags, Bun's command-line mode loads `.env` and `bunfig.toml` preloads from its working folder and installs missing packages from npm.
- The dashboard server shows in `ps` and Activity Monitor as a second copy of OpenCode's executable: Bun's `process.title` does not rename it.
- It lowers its own CPU priority for its whole life (nice 10, below-normal on Windows), so on a busy machine OpenCode goes first.
- The stats store has exactly one writer. The lock's connection must stay referenced for the server's whole life: garbage collection closes an unreferenced `bun:sqlite` connection and drops the lock without an error.
- One per user, not per machine: a second account runs its own dashboard server, on another port.
- In plugin mode the dashboard is up while any OpenCode process with the plugin runs, plus about 10 s, which also carries it across plugin reloads and OpenCode upgrade restarts. OpenCode's background service outlives its windows, so in practice that is most of the time the user is logged in.
- A newer launcher replaces an older dashboard server that a plugin started, and an older launcher uses a newer one, so the hold protocol stays compatible across releases. A dashboard server running in a terminal is never replaced.
- A launcher that finds a dashboard server for another OpenCode database leaves it alone and reports the conflict: v1 serves one database at a time.
