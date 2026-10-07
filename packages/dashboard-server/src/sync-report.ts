import type { StoreEvent } from "@opencode-stats/stats-store";
import { stopReason, type SyncStop } from "@opencode-stats/browser-copy/api";
import { buildLine, rereadLine } from "./build-line.ts";
import type { LogEvent } from "./log.ts";

function storeLogEvent(event: StoreEvent): LogEvent {
  // Keep each event's discriminant paired with its fields while changing the log key.
  switch (event.kind) {
    case "build.start":
    case "build.end": {
      const { kind, ...fields } = event;
      return { event: kind, ...fields };
    }
    case "reread.start":
    case "reread.end": {
      const { kind, ...fields } = event;
      return { event: kind, ...fields };
    }
    case "sync.stopped":
    case "sync.resumed": {
      const { kind, ...fields } = event;
      return { event: kind, ...fields };
    }
    case "schema.checked": {
      const { kind, ...fields } = event;
      return { event: kind, ...fields };
    }
    default: {
      const { kind, ...fields } = event;
      return { event: kind, ...fields };
    }
  }
}

function terminalStopLine(
  event: Extract<StoreEvent, { kind: "sync.stopped" | "sync.resumed" }>,
  stop: SyncStop,
  now: Date,
  color: boolean,
) {
  const reason =
    event.kind === "sync.resumed"
      ? "Up to date again."
      : `Not updating: ${stopReason(stop, (timestamp) => new Date(timestamp).toLocaleTimeString("en-GB", { hour12: false, hour: "2-digit", minute: "2-digit" }))}`;
  const line = `${now.toLocaleTimeString("en-GB", { hour12: false })}  ${reason}`;
  return `${color ? `\u001b[33m${line}\u001b[0m` : line}\n`;
}

export function syncReport(options: {
  params: Omit<SyncStop["params"], "code" | "lockedSince">;
  log: (event: LogEvent) => void;
  status: (stop: SyncStop | null) => void;
  output: (line: string) => void;
  error: (line: string) => void;
  color: boolean;
  now: () => Date;
}) {
  return (event: StoreEvent) => {
    // No library error messages, SQL, source JSON or public reason parameters enter the log.
    options.log(storeLogEvent(event));
    const now = options.now();
    if (event.kind === "sync.stopped" || event.kind === "sync.resumed") {
      const stop: SyncStop = {
        since: event.since,
        reason:
          event.reason === "schema.v1" && options.params.mode === "plugin"
            ? "schema.other"
            : event.reason,
        params: { ...options.params, code: event.code, lockedSince: event.lockedSince },
      };
      options.status(event.kind === "sync.stopped" ? stop : null);
      if (options.params.mode === "terminal")
        options.error(terminalStopLine(event, stop, now, options.color));
    } else if (options.params.mode === "terminal") {
      if (event.kind === "build.start" || event.kind === "build.end")
        options.output(buildLine(event, options.params.release, now));
      else if (event.kind === "reread.start" || event.kind === "reread.end")
        options.output(rereadLine(event, now));
    }
  };
}
