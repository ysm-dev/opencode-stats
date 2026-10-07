import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Schema from "effect/Schema";
import { expect, it } from "vitest";
import { temporaryPort } from "@opencode-stats/launcher/testing";
import { syntheticFixture } from "@opencode-stats/stats-store/testing";
import { nodeRuntime } from "@opencode-stats/stats-store/node";
import { decode, encode, formatVersion } from "@opencode-stats/browser-copy";
import { createLiveFeed, LiveAnnouncement } from "@opencode-stats/browser-copy/api";
import { syntheticCopy } from "@opencode-stats/browser-copy/testing";
import { nodeServer } from "./http.node.ts";
import { nodeLock } from "./lock.node.ts";
import { program } from "./main.ts";
import { startServer } from "./server.ts";
import { readySignal } from "./testing/program.ts";
import { version } from "./paths.ts";

it("announces real store commits and serves exact edits and tombstones through HTTP", async () => {
  const fixture = syntheticFixture();
  fixture.writer.session("ses-live-http");
  const message = { id: "msg-live-http", session: "ses-live-http", seq: 0, start: 1 };
  fixture.writer.message({ ...message, tokens: { input: 1 } });
  const port = await temporaryPort();
  const origin = `http://127.0.0.1:${port}`;
  const signal = readySignal();
  const fiber = Effect.runFork(
    program(["--port", String(port), "--db", fixture.source], nodeServer, nodeRuntime, nodeLock, {
      XDG_STATE_HOME: fixture.folder,
      XDG_CACHE_HOME: fixture.folder,
    }),
  );
  try {
    await signal.ready;
    const first = decode(await (await fetch(`${origin}/api/browser-copy`)).arrayBuffer());
    const live = await fetch(`${origin}/api/browser-copy/live`);
    expect(live.headers.get("content-type")).toContain("text/event-stream");
    expect(live.headers.get("content-encoding")).toBeNull();
    expect(live.headers.get("cache-control")).toBe("no-store");
    expect(live.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    const reader = live.body!.getReader();
    const read = async () => {
      let text = "";
      while (!text.includes("\n\n")) {
        const chunk = await reader.read();
        if (chunk.done) throw new Error("Live stream ended");
        text += new TextDecoder().decode(chunk.value);
      }
      const data = text
        .split("\n")
        .find((line) => line.startsWith("data:"))!
        .slice(5);
      return Schema.decodeUnknownSync(LiveAnnouncement)(JSON.parse(data));
    };
    try {
      expect(await read()).toEqual({
        generation: first.generation,
        revision: first.revision,
        release: version,
        format: formatVersion,
        stop: null,
      });
      fixture.writer.message({ ...message, tokens: { input: 9 } });
      const next = await read();
      expect(next).toEqual({
        generation: first.generation,
        revision: first.revision + 1,
        stop: null,
      });
      const address = (revision: number, generation = first.generation) =>
        `${origin}/api/browser-copy/changes?generation=${generation}&revision=${revision}`;
      const changes = decode(await (await fetch(address(first.revision))).arrayBuffer());
      expect(changes.kind).toBe("changes");
      expect(changes.fromRevision).toBe(first.revision);
      expect(changes.ids).toEqual([message.id]);
      expect([...changes.steps.input]).toEqual([9]);
      fixture.writer.revert(message.session, 0);
      const deleted = await read();
      const tombstones = decode(await (await fetch(address(next.revision))).arrayBuffer());
      expect(tombstones.revision).toBe(deleted.revision);
      expect(tombstones.ids).toEqual([]);
      expect(tombstones.tombstones).toEqual([message.id]);
      const whole = decode(await (await fetch(address(0, "another-generation"))).arrayBuffer());
      expect(whole.kind).toBe("whole");
      expect(whole.revision).toBe(deleted.revision);
    } finally {
      await reader.cancel();
    }
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber));
    signal.output.mockRestore();
    fixture.dispose();
  }
});

it("returns a content-free unavailable response when the changes reader fails", async () => {
  const copy = syntheticCopy([]);
  const feed = createLiveFeed(() => copy, "test-release");
  const bytes = new Uint8Array(encode(copy));
  try {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const origin = yield* startServer("unused", {
            whole: () => bytes,
            changes: () => Effect.fail(new Error("SYNTHETIC PRIVATE CONTENT")),
            live: feed.stream,
          });
          yield* Effect.promise(async () => {
            const response = await fetch(
              `${origin}/api/browser-copy/changes?generation=${copy.generation}&revision=1`,
            );
            expect(response.status).toBe(503);
            expect(await response.text()).toBe("");
          });
        }).pipe(Effect.provide(nodeServer(0))),
      ),
    );
  } finally {
    await feed.close();
  }
});
