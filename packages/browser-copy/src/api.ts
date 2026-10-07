import * as Schema from "effect/Schema";
import * as HttpApi from "effect/http-api/HttpApi";
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import * as HttpApiGroup from "effect/http-api/HttpApiGroup";
import * as HttpApiSchema from "effect/http-api/HttpApiSchema";

const revision = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0));
export const Cursor = Schema.Struct({ generation: Schema.NonEmptyString, revision });
export type CopyCursor = typeof Cursor.Type;
export const SyncStop = Schema.Struct({
  since: revision,
  reason: Schema.Literals([
    "schema.newer",
    "schema.v1",
    "schema.other",
    "source.missing",
    "source.unreadable",
    "source.locked",
    "store.unwritable",
  ]),
  params: Schema.Struct({
    release: Schema.String,
    mode: Schema.Literals(["plugin", "terminal"]),
    database: Schema.String,
    source: Schema.String,
    cache: Schema.String,
    code: Schema.Literals(["permission", "damaged", "full", "unavailable", "locked"]),
    lockedSince: revision,
  }),
});
export type SyncStop = typeof SyncStop.Type;
export const LiveAnnouncement = Schema.Struct({
  ...Cursor.fields,
  release: Schema.optionalKey(Schema.NonEmptyString),
  format: Schema.optionalKey(Schema.Int),
  stop: Schema.optionalKey(Schema.NullOr(SyncStop)),
}).check(
  Schema.makeFilter((event) => (event.release === undefined) === (event.format === undefined), {
    message: "Incomplete live-stream version",
  }),
);
export type LiveAnnouncement = typeof LiveAnnouncement.Type;

const copyGroup = HttpApiGroup.make("browserCopy").add(
  HttpApiEndpoint.get("whole", "/api/browser-copy", {
    success: Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array()),
  }),
  HttpApiEndpoint.get("changes", "/api/browser-copy/changes", {
    query: Schema.Struct({
      generation: Schema.NonEmptyString,
      revision: Schema.NumberFromString.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
    }),
    success: Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array()),
  }),
  HttpApiEndpoint.get("live", "/api/browser-copy/live", {
    success: HttpApiSchema.StreamSse({ data: LiveAnnouncement }),
  }),
);

export const BrowserCopyApi = HttpApi.make(copyGroup.identifier).add(copyGroup);
export { createLiveFeed } from "./live.ts";
export { stopReason } from "./stop-reason.ts";
