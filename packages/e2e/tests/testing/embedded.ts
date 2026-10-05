import { spawn } from "node:child_process";
import { capture } from "./process.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, vi } from "vitest";
import { temporaryPort } from "@opencode-stats/launcher/testing";
import { decode } from "@opencode-stats/browser-copy";
import pin from "../../../../native/sqlite/test-runtime.json" with { type: "json" };
import { opencodeExecutable } from "../../../../scripts/opencode-runtime.ts";

export async function checkEmbedded(
  installed: string,
  source: string,
  home: string,
): Promise<void> {
  const architecture = process.env["OPENCODE_TEST_ARCH"] ?? process.arch;
  const executable = opencodeExecutable(pin.opencode, architecture);
  const port = await temporaryPort();
  const before = readFileSync(source);
  const child = spawn(
    executable,
    [
      "--no-env-file",
      `--config=${join(installed, "empty-bunfig.toml")}`,
      "--no-install",
      join(installed, "process.js"),
      "--port",
      String(port),
      "--db",
      source,
    ],
    {
      cwd: installed,
      env: {
        BUN_BE_BUN: "1",
        HOME: home,
        XDG_STATE_HOME: home,
        XDG_CACHE_HOME: home,
        XDG_DATA_HOME: home,
      },
    },
  );
  const { transcript, closed } = capture(child);
  try {
    await vi.waitFor(() => expect(transcript.output).toBe("opencode-stats-ready\n"), {
      timeout: 10000,
    });
    const response = await fetch(`http://127.0.0.1:${port}/api/browser-copy`);
    expect(response.status).toBe(200);
    const copy = decode(await response.arrayBuffer());
    expect(Array.from(copy.steps.start)).toEqual([1234567890000]);
    expect(Array.from(copy.steps.input)).toEqual([1]);
    expect(Array.from(copy.steps.cacheRead)).toEqual([2]);
    expect(Array.from(copy.steps.cacheWrite)).toEqual([3]);
    expect(Array.from(copy.steps.output)).toEqual([4]);
    expect(Array.from(copy.steps.reasoning)).toEqual([5]);
    expect(readFileSync(source)).toEqual(before);
    expect(transcript.error).toBe("");
  } finally {
    child.kill("SIGINT");
    await closed;
  }
}
