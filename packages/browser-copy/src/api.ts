import * as Schema from "effect/Schema";
import * as HttpApi from "effect/http-api/HttpApi";
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import * as HttpApiGroup from "effect/http-api/HttpApiGroup";
import * as HttpApiSchema from "effect/http-api/HttpApiSchema";

const revision = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0));
export const Cursor = Schema.Struct({ generation: Schema.NonEmptyString, revision });
export type CopyCursor = typeof Cursor.Type;
export const LiveAnnouncement = Schema.Union([
  Schema.Struct({ ...Cursor.fields, release: Schema.NonEmptyString, format: Schema.Int }),
  Cursor,
]);
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
