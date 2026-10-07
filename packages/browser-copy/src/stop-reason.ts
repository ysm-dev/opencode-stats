import type { SyncStop } from "./api.ts";

export function stopReason(stop: SyncStop, time: (timestamp: number) => string) {
  const { reason, params } = stop;
  const path = `${params.database}${params.source ? ` ${params.source}` : ""}`;
  switch (reason) {
    case "schema.newer":
      return `OpenCode's database is newer than opencode-stats ${params.release} understands · run ${params.mode === "plugin" ? "opencode plugin update opencode-stats" : "bunx opencode-stats@latest"}`;
    case "schema.v1":
      return `${path} is OpenCode v1's database · opening it once with OpenCode v2 upgrades it`;
    case "schema.other":
      return `${path} isn't an OpenCode database opencode-stats recognises · it reads OpenCode 2.0 and later`;
    case "source.missing":
      return `OpenCode's database is missing from ${path}`;
    case "source.locked":
      return `OpenCode's database has been locked since ${time(params.lockedSince)}`;
    case "source.unreadable":
      return `can't read OpenCode's database: ${params.code === "permission" ? "permission denied" : params.code === "damaged" ? "it's damaged" : "it's unavailable"}`;
  }
  return `can't save statistics in ${params.cache}: ${params.code === "full" ? "the disk is full" : params.code === "permission" ? "permission denied" : "it's unavailable"}`;
}
