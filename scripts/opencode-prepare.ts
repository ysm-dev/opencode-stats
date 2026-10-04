import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pin from "../native/sqlite/test-runtime.json" with { type: "json" };
import { narrowJson, object, text } from "./json.ts";

if (process.platform === "darwin") {
  const architecture = process.argv[2] ?? process.env["OPENCODE_TEST_ARCH"] ?? process.arch;
  if (architecture !== "arm64" && architecture !== "x64")
    throw new Error("Unsupported embedded-Bun test architecture");
  if (Date.now() - Date.parse(pin.released) < 3 * 86400000)
    throw new Error("Embedded-Bun test release is younger than three days");
  const folder = resolve(".dev/opencode-test", architecture);
  const executable = resolve(
    folder,
    `node_modules/@opencode/cli-darwin-${architecture}/bin/opencode`,
  );
  if (!existsSync(executable)) {
    mkdirSync(folder, { recursive: true });
    writeFileSync(resolve(folder, "package.json"), JSON.stringify({ private: true }));
    execFileSync(
      "npm",
      [
        "install",
        "--force",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--package-lock=false",
        `@opencode/cli-darwin-${architecture}@${pin.opencode}`,
      ],
      { cwd: folder, stdio: "inherit" },
    );
  }
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
          { encoding: "utf8", timeout: 60000, env: { BUN_BE_BUN: "1", HOME: folder } },
        ),
      ),
    ),
  );
  if (text(runtime["arch"]) !== architecture) throw new Error("Embedded-Bun architecture mismatch");
  process.stdout.write(`Verified embedded Bun ${text(runtime["bun"])} (${architecture}).\n`);
  process.stdout.write(
    `Embedded OpenCode ${pin.opencode} test executable prepared (${architecture}).\n`,
  );
}
