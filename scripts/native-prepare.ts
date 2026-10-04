import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import manifest from "../native/sqlite/manifest.json" with { type: "json" };

const bytes = readFileSync("native/sqlite/libsqlite3.dylib");
if (createHash("sha256").update(bytes).digest("hex") !== manifest.sha256)
  throw new Error("Native SQLite artifact checksum mismatch");
if (bytes.readUInt32BE(0) !== 0xcafebabe || bytes.readUInt32BE(4) !== 2)
  throw new Error("Native SQLite must be a universal two-architecture Mach-O");
const expected: Readonly<Record<number, string>> = {
  0x0100000c: manifest.slices.arm64,
  0x01000007: manifest.slices.x86_64,
};
const seen = new Set<number>();
for (let index = 0; index < 2; index++) {
  const entry = 8 + index * 20;
  const cpu = bytes.readUInt32BE(entry);
  const offset = bytes.readUInt32BE(entry + 8);
  const size = bytes.readUInt32BE(entry + 12);
  if (
    seen.has(cpu) ||
    createHash("sha256")
      .update(bytes.subarray(offset, offset + size))
      .digest("hex") !== expected[cpu]
  )
    throw new Error("Native SQLite architecture/slice checksum mismatch");
  seen.add(cpu);
}
const output = resolve(process.argv[2] ?? ".dev/native/sqlite");
mkdirSync(output, { recursive: true });
for (const file of ["libsqlite3.dylib", "manifest.json", "NOTICE.txt"])
  copyFileSync(resolve("native/sqlite", file), resolve(output, file));
process.stdout.write("Controlled macOS SQLite assets prepared.\n");
