import { expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { bunWorker } from "./worker.bun.ts";
import { syntheticFixture } from "./testing/index.ts";
import { storePaths } from "./location.ts";

test("native Bun Worker reports a failed build and terminates cleanly", async () => {
  const fixture = syntheticFixture();
  try {
    const paths = storePaths({ source: fixture.source, cacheHome: fixture.folder });
    const failure = await Effect.runPromise(
      Effect.exit(Effect.scoped(bunWorker({ ...paths, source: `${paths.source}.missing` }))),
    );
    expect(Exit.isFailure(failure)).toBe(true);
  } finally {
    fixture.dispose();
  }
});
