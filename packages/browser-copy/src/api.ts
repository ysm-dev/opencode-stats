import * as Schema from "effect/Schema";
import * as HttpApi from "effect/http-api/HttpApi";
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import * as HttpApiGroup from "effect/http-api/HttpApiGroup";
import * as HttpApiSchema from "effect/http-api/HttpApiSchema";

const copyGroup = HttpApiGroup.make("browserCopy").add(
  HttpApiEndpoint.get("whole", "/api/browser-copy", {
    success: Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array()),
  }),
);

export const BrowserCopyApi = HttpApi.make(copyGroup.identifier).add(copyGroup);
