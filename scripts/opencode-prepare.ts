import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import pin from "../native/sqlite/test-runtime.json" with { type: "json" };
import { narrowJson, object, text } from "./json.ts";
import { prepareOpenCode } from "./opencode-runtime.ts";

{
  const architecture = process.argv[2] ?? process.env["OPENCODE_TEST_ARCH"] ?? process.arch;
  if (architecture !== "arm64" && architecture !== "x64")
    throw new Error("Unsupported embedded-Bun test architecture");
  if (Date.now() - Date.parse(pin.released) < 3 * 86400000)
    throw new Error("Embedded-Bun test release is younger than three days");
  // Verify both binaries during preparation, including cold cross-architecture translation.
  // Preparation remains inside the public e2e command's existing whole-run watchdog.
  for (const version of [pin.minimum, pin.opencode]) {
    const executable = prepareOpenCode(version, architecture);
    const runtime = object(
      narrowJson(
        JSON.parse(
          execFileSync(
            executable,
            [
              "--no-env-file",
              "--no-install",
              "--print",
              "JSON.stringify({arch:process.arch,bun:Bun.version})",
            ],
            {
              encoding: "utf8",
              timeout: 60000,
              env: { BUN_BE_BUN: "1", HOME: resolve(".dev/opencode-test/private-home") },
            },
          ),
        ),
      ),
    );
    if (text(runtime["arch"]) !== architecture)
      throw new Error("Embedded-Bun architecture mismatch");
    process.stdout.write(`Verified embedded Bun ${text(runtime["bun"])} (${architecture}).\n`);
    process.stdout.write(
      `Embedded OpenCode ${version} test executable prepared (${architecture}).\n`,
    );
  }
}
