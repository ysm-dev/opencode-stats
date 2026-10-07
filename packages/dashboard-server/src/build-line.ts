import type { BuildEvent, StoreEvent } from "@opencode-stats/stats-store";

export function buildLine(event: BuildEvent, version: string, now: Date) {
  const time = now.toLocaleTimeString("en-GB", { hour12: false });
  if (event.kind === "build.end")
    return `${time}  Read ${event.sessions.toLocaleString("en-US")} sessions and ${event.steps.toLocaleString("en-US")} steps in ${(event.milliseconds / 1000).toFixed(1)} s.\n`;
  const reason =
    event.reason === "version"
      ? ` for opencode-stats ${version}`
      : event.reason === "damaged"
        ? ": the saved statistics were damaged"
        : event.reason === "resume"
          ? ": continuing the saved build"
          : "";
  return `${time}  Reading your OpenCode history, newest first${reason}…\n`;
}

export function rereadLine(
  event: Extract<StoreEvent, { kind: "reread.start" | "reread.end" }>,
  now: Date,
) {
  const time = now.toLocaleTimeString("en-GB", { hour12: false });
  if (event.kind === "reread.start")
    return `${time}  ${event.reason === "migration" ? "OpenCode's database was migrated" : "OpenCode finished importing v1 history"}: re-reading every session…\n`;
  return `${time}  Re-read ${event.sessions.toLocaleString("en-US")} sessions in ${(event.milliseconds / 1000).toFixed(1)} s; ${event.changed.toLocaleString("en-US")} had changed.\n`;
}
