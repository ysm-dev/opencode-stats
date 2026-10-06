import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpServer from "effect/http/HttpServer";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import { BrowserCopyApi, createLiveFeed } from "../api.ts";
import { encode } from "../binary.ts";
import { tokenKinds, type BrowserCopy, type Step } from "../facts.ts";
import { syntheticCopy } from "./synthetic.ts";

type Fetch = (...args: Parameters<typeof globalThis.fetch>) => ReturnType<typeof globalThis.fetch>;

const at = (copy: BrowserCopy, index: number): Step => {
  const amount = (kind: (typeof tokenKinds)[number]) =>
    Number.isNaN(copy.steps[kind][index]) ? null : copy.steps[kind][index]!;
  return {
    start: copy.steps.start[index]!,
    input: amount("input"),
    cacheRead: amount("cacheRead"),
    cacheWrite: amount("cacheWrite"),
    output: amount("output"),
    reasoning: amount("reasoning"),
  };
};

function difference(before: BrowserCopy, after: BrowserCopy): BrowserCopy {
  const previous = new Map(before.ids.map((id, index) => [id, index]));
  const current = new Set(after.ids);
  const indices = after.ids.flatMap((id, index) => {
    const old = previous.get(id);
    return old === undefined ||
      (["start", ...tokenKinds] as const).some(
        (column) => !Object.is(before.steps[column][old], after.steps[column][index]),
      )
      ? [index]
      : [];
  });
  return syntheticCopy(
    indices.map((index) => at(after, index)),
    {
      kind: "changes",
      generation: after.generation,
      fromRevision: before.revision,
      revision: after.revision,
      historyCompleteFrom: after.historyCompleteFrom,
      ids: indices.map((index) => after.ids[index]!),
      tombstones: before.ids.filter((id) => !current.has(id)),
      names: after.names.filter(
        (name) =>
          !before.names.some(
            (old) =>
              old.dimension === name.dimension &&
              old.code === name.code &&
              old.id === name.id &&
              old.name === name.name,
          ),
      ),
    },
  );
}

export function inMemoryDashboardServer(
  copy: BrowserCopy,
  beforeCopy: () => Promise<void> = () => Promise.resolve(),
) {
  let online = true;
  let requests = 0;
  let current = copy;
  const snapshots = new Map([[copy.revision, copy]]);
  let nextChanges: BrowserCopy | undefined;
  const feed = createLiveFeed(() => current, "test-release");
  const addresses: string[] = [];
  const handlers = HttpApiBuilder.group(BrowserCopyApi, "browserCopy", (h) =>
    h
      .handle("whole", () =>
        Effect.promise(async () => {
          await beforeCopy();
          return new Uint8Array(encode(current));
        }),
      )
      .handle("changes", ({ query }) =>
        Effect.sync(() => {
          const previous = snapshots.get(query.revision);
          const result =
            nextChanges ??
            (previous && query.generation === current.generation
              ? difference(previous, current)
              : current);
          nextChanges = undefined;
          return new Uint8Array(encode(result));
        }),
      )
      .handle("live", () => Effect.succeed(feed.stream)),
  );
  const routes = HttpApiBuilder.layer(BrowserCopyApi).pipe(
    Layer.provide(handlers),
    Layer.provide(HttpServer.layerServices),
  );
  const server = HttpRouter.toWebHandler(routes, { disableLogger: true });
  const fetch: Fetch = (input, init) => {
    requests++;
    const request = new Request(input, init);
    addresses.push(request.url);
    if (!online) return Promise.resolve(new Response(null, { status: 503 }));
    return server.handler(request);
  };
  return {
    fetch,
    addresses,
    dispose: async () => {
      await feed.close();
      await server.dispose();
    },
    commit: (next: BrowserCopy) => {
      if (next.generation !== current.generation) snapshots.clear();
      current = next;
      snapshots.set(next.revision, next);
      feed.announce(next);
    },
    expireBefore: (revision: number) => {
      for (const existing of snapshots.keys()) {
        if (existing < revision) snapshots.delete(existing);
      }
    },
    respondWithChanges: (changes: BrowserCopy) => {
      nextChanges = changes;
    },
    get requests() {
      return requests;
    },
    drop: () => {
      online = false;
    },
    resume: () => {
      online = true;
    },
  };
}
