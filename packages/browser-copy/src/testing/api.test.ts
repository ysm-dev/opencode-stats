import { expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import * as HttpApiClient from "effect/http-api/HttpApiClient";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { BrowserCopyApi } from "../api.ts";
import { decode, formatVersion } from "../index.ts";
import { inMemoryDashboardServer, syntheticCopy } from "./index.ts";

it("opens with protocol versions and retains only the latest revision for a slow stream consumer", async () => {
  const original = syntheticCopy([]);
  const server = inMemoryDashboardServer(original);
  const opened = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let count = 0;
  const events = Effect.runPromise(
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(BrowserCopyApi, {
        baseUrl: "http://127.0.0.1:22440",
      });
      const stream = yield* client.browserCopy.live();
      return yield* stream.pipe(
        Stream.tap(() =>
          Effect.promise(async () => {
            if (++count === 1) {
              opened.resolve();
              await release.promise;
            }
          }),
        ),
        Stream.take(2),
        Stream.runCollect,
      );
    }).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, server.fetch),
    ),
  );
  try {
    await Promise.race([opened.promise, events]);
    for (let revision = 2; revision <= 100; revision++)
      server.commit(syntheticCopy([], { revision }));
    release.resolve();
    expect(await events).toEqual([
      {
        generation: original.generation,
        revision: 1,
        release: "test-release",
        format: formatVersion,
      },
      { generation: original.generation, revision: 100 },
    ]);
  } finally {
    release.resolve();
    await server.dispose();
  }
});

it("serves precise binary changes and falls back to whole facts for expired cursors", async () => {
  const first = syntheticCopy([
    { start: 1, input: 1, cacheRead: null, cacheWrite: 0, output: 0, reasoning: 0 },
  ]);
  const server = inMemoryDashboardServer(first);
  try {
    const next = syntheticCopy([], {
      revision: 2,
      names: [{ dimension: "model", code: 1, id: "test/model", name: "A name" }],
    });
    server.commit(next);
    const address = `http://127.0.0.1:22440/api/browser-copy/changes?generation=${first.generation}&revision=1`;
    const response = await server.fetch(address);
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(decode(await response.arrayBuffer())).toEqual(
      syntheticCopy([], {
        kind: "changes",
        fromRevision: 1,
        revision: 2,
        tombstones: first.ids,
        names: next.names,
      }),
    );
    server.expireBefore(2);
    expect(decode(await (await server.fetch(address)).arrayBuffer())).toEqual(next);
    const invalid = await server.fetch(address.replace("revision=1", "revision=-1"));
    expect(invalid.status).toBe(400);
    await invalid.text();
  } finally {
    await server.dispose();
  }
});
