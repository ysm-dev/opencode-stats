import * as Schema from "effect/Schema";
import { expect, it } from "vitest";
import { SyncStop, stopReason, LiveAnnouncement } from "./api.ts";
import { syntheticStop } from "./testing/index.ts";

it.each([
  [
    syntheticStop(),
    "OpenCode's database is newer than opencode-stats 1.3.0 understands · run bunx opencode-stats@latest",
  ],
  [
    syntheticStop("schema.newer", { mode: "plugin" }),
    "OpenCode's database is newer than opencode-stats 1.3.0 understands · run opencode plugin update opencode-stats",
  ],
  [
    syntheticStop("schema.v1"),
    "~/synthetic.db (from `--db`) is OpenCode v1's database · opening it once with OpenCode v2 upgrades it",
  ],
  [
    syntheticStop("schema.other", { source: "" }),
    "~/synthetic.db isn't an OpenCode database opencode-stats recognises · it reads OpenCode 2.0 and later",
  ],
  [
    syntheticStop("source.missing"),
    "OpenCode's database is missing from ~/synthetic.db (from `--db`)",
  ],
  [syntheticStop("source.locked"), "OpenCode's database has been locked since 14:02"],
  [
    syntheticStop("source.unreadable", { code: "permission" }),
    "can't read OpenCode's database: permission denied",
  ],
  [
    syntheticStop("source.unreadable", { code: "damaged" }),
    "can't read OpenCode's database: it's damaged",
  ],
  [syntheticStop("source.unreadable"), "can't read OpenCode's database: it's unavailable"],
  [
    syntheticStop("store.unwritable", { code: "full" }),
    "can't save statistics in ~/.cache/opencode-stats: the disk is full",
  ],
  [
    syntheticStop("store.unwritable", { code: "permission" }),
    "can't save statistics in ~/.cache/opencode-stats: permission denied",
  ],
  [
    syntheticStop("store.unwritable"),
    "can't save statistics in ~/.cache/opencode-stats: it's unavailable",
  ],
] as const)("renders the typed %j problem without leaking library messages", (stop, text) => {
  expect(stopReason(Schema.decodeUnknownSync(SyncStop)(stop), () => "14:02")).toBe(text);
});

it("never drops malformed stop parameters by falling back to a plain cursor", () => {
  const cursor = { generation: "synthetic", revision: 1 };
  expect(() =>
    Schema.decodeUnknownSync(LiveAnnouncement)({
      ...cursor,
      stop: { ...syntheticStop(), since: -1 },
    }),
  ).toThrow();
  expect(() => Schema.decodeUnknownSync(LiveAnnouncement)({ ...cursor, release: "new" })).toThrow(
    "Incomplete live-stream version",
  );
  expect(Schema.decodeUnknownSync(LiveAnnouncement)(cursor)).toEqual(cursor);
});

it.each([
  { ...syntheticStop(), reason: "raw private error" },
  { ...syntheticStop(), since: -1 },
  { ...syntheticStop(), params: { ...syntheticStop().params, code: "SQLITE_FULL" } },
  { ...syntheticStop(), params: { ...syntheticStop().params, mode: "unsupported" } },
])("rejects invalid stop-state input at the SSE boundary", (input) => {
  expect(() => Schema.decodeUnknownSync(SyncStop)(input)).toThrow();
});
