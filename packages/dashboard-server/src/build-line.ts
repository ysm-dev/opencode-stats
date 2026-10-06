import type { BuildEvent } from "@opencode-stats/stats-store";

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
