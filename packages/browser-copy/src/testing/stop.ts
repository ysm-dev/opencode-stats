import type { SyncStop } from "../api.ts";

export const syntheticStop = (
  reason: SyncStop["reason"] = "schema.newer",
  params: Partial<SyncStop["params"]> = {},
  since = Date.parse("2026-10-07T14:02Z"),
): SyncStop => ({
  reason,
  since,
  params: {
    release: "1.3.0",
    mode: "terminal",
    database: "~/synthetic.db",
    source: "(from `--db`)",
    cache: "~/.cache/opencode-stats",
    code: "unavailable",
    lockedSince: since,
    ...params,
  },
});
