# Tool-call facts (#46)

Source shapes are pinned to OpenCode 2.0.22, commit
`d259ae716379a67bcc35943ba75590f1fc7a1b26`:

- [AssistantTool](https://github.com/anomalyco/opencode/blob/d259ae716379a67bcc35943ba75590f1fc7a1b26/packages/schema/src/session-message.ts):
  assistant `content` items of type `tool`, recorded `id` and `name`,
  `state.status`, `state.error.type`, and `time.ran` / `time.completed`.
- [Code Mode](https://github.com/anomalyco/opencode/blob/d259ae716379a67bcc35943ba75590f1fc7a1b26/packages/core/src/codemode/tool.ts):
  `execute`'s nested calls are `state.metadata.toolCalls` entries with
  `tool`, `status` and optional `input`, not assistant content items.

Only chosen scalar leaves cross the SQLite boundary. Tool inputs, outputs,
metadata, nested calls and error messages never enter the stats store.
Provider-hosted `executed` is not an outcome and is not read.

Calls use `tool:<message ID>:<recorded call ID>` identities. The store joins
each call to its counted step on read, including changes when either revision
moves. This preserves step attribution through project moves and subagent
ownership changes, and leaves copied fork history out. Names merge only
`bash` → `shell`, `task` → `subagent`, `apply_patch` → `patch`.

Terminal `invalid` calls fail even when a v1 stand-in recorded completion.
Completed calls succeed; errors `aborted`, `tool.interrupted` and
`permission.rejected` stop; other errors fail. Streaming/running calls have
no outcome. Missing start and completion remain NULL, including migrated
calls; only calls with both boundaries contribute a finished run time.
Stopped calls contribute to timed percentiles when timed, but not the failure
rate denominator. Percentiles use exact observed nearest ranks; timed share
uses every matching call as its denominator.

The Tool checklist excludes its own ticks and counts calls. Other checklists,
steps, prompts, tokens and session placement ignore the tool dimension.
Unknown tool IDs stay removable raw-ID chips and match no calls.

Store version 6 and browser format 5 are fingerprinted using synthetic
fixtures. No dependencies, gate relaxations or exceptions were added.
Local work ran formatting and generation only; gates and tests require
GitHub-hosted Actions.
