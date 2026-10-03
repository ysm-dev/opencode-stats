# Diagnostics are safe to share

In plugin mode the dashboard server runs detached and its output is discarded, so whatever it has to report must go to a file, and users attach such files to public GitHub issues. Its data is not safe to publish: the stats store holds project names and session titles, and the libraries that touch it put values into their errors. drizzle's error for a failed query carries the SQL and every bound value in its message, and Effect prints an error's message, nested causes and file paths as they are. So opencode-stats keeps one log, `server.log` in its state folder, and one diagnostics report, printed by `bunx opencode-stats --diagnose` and copied by "Copy diagnostics" in the dashboard, and both are safe to share as they are. They hold versions, platform, timings, counts, sizes, error kinds and codes, OpenCode's opaque session and message IDs, and paths with the home folder written `~`. They never hold project names or directories, session titles, message content or spend figures, and never a library's error message: an error is recorded as its kind, its code and the name of our statement.

## Considered Options

- **A detailed private log, plus a report cleaned up on demand.** Richer for local debugging, but people attach the wrong file, and removing private data after the fact is easy to get wrong.
- **Logging errors as they are, through a redaction pass.** A redactor has to recognise every value it removes, and titles and project names have no shape to recognise.
- **No log file.** Plugin mode's problems would leave no trace at all.

## Consequences

- The log's formatter never prints an error's message or cause: every error reaches it already mapped to a kind and a code, at the boundary of the library that raised it.
- A test sends a made-up session title through a failing query and fails if the title reaches the log or the report.
- The problem screen's details and the dashboard's "Copy diagnostics" follow the same rule, and carry nothing from the browser copy.
- A bug that hinges on a particular title or path can't be diagnosed from the log alone: the maintainer asks for what's needed, and the user chooses what to share.
