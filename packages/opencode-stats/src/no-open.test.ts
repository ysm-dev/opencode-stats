import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { publishRecord } from "@opencode-stats/launcher";
import { closeServer, listen, serverRecord } from "@opencode-stats/launcher/testing";
import { run } from "./main.ts";

it("--no-open does not invoke an OS-refused opener, with a real invocation positive control", async () => {
  vi.stubGlobal("Bun", { version: "1.4.2" });
  const folder = mkdtempSync(join(tmpdir(), "refused-opener-"));
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "rundll32.exe"
        : "xdg-open";
  // A directory cannot be executed. An invocation fails before the awaited bin call returns;
  // unlike a detached marker writer, this refusal cannot race an absence assertion.
  mkdirSync(join(folder, command));
  const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const error = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  let record: ReturnType<typeof serverRecord>;
  const server = createServer((_request, response) => response.end(JSON.stringify(record)));
  record = serverRecord(await listen(server), { starter: "terminal" });
  publishRecord(join(folder, "opencode-stats"), record);
  const settings = { env: { XDG_STATE_HOME: folder, PATH: folder } };
  try {
    expect(await run(["--no-open", "--db", record.database], settings)).toBe(0);
    expect(error).not.toHaveBeenCalled();
    expect(await run(["--db", record.database], settings)).toBe(0);
    expect(error).toHaveBeenCalledExactlyOnceWith(
      `Couldn't open the browser. Open ${record.address} instead.\n`,
    );
  } finally {
    await closeServer(server);
    output.mockRestore();
    error.mockRestore();
    vi.unstubAllGlobals();
    rmSync(folder, { recursive: true });
  }
});
