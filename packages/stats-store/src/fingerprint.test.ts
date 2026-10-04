import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { syntheticFixture, readBuilt } from "./testing/index.ts";
import { fingerprintFixture } from "./testing/fingerprint.ts";
import { statsStoreVersion } from "./build.ts";
import statements from "./statements.json" with { type: "json" };
import fingerprints from "./fingerprints.json" with { type: "json" };
const hashes: Readonly<Record<number, string>> = fingerprints;

it("requires a new stats-store version when create statements or counted facts change", async () => {
  const fixture = syntheticFixture();
  try {
    fingerprintFixture(fixture.writer);
    const copy = await readBuilt({ source: fixture.source, cacheHome: fixture.folder });
    const fingerprint = createHash("sha256")
      .update(JSON.stringify({ statements, steps: copy.steps }))
      .digest("hex");
    expect(fingerprint, "change the stats-store version").toBe(hashes[statsStoreVersion]);
  } finally {
    fixture.dispose();
  }
});
