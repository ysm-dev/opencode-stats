import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import manifest from "../native/sqlite/manifest.json" with { type: "json" };

if (process.platform !== "darwin")
  throw new Error("Native SQLite builds require macOS/Xcode; installed users never compile.");
const folder = resolve(".dev/sqlite-build");
mkdirSync(folder, { recursive: true });
const archive = Buffer.from(await (await fetch(manifest.source.url)).arrayBuffer());
const digest = (bytes: Uint8Array, algorithm = "sha256") =>
  createHash(algorithm).update(bytes).digest("hex");
if (
  digest(archive) !== manifest.source.sha256 ||
  digest(archive, "sha3-256") !== manifest.source.sha3
)
  throw new Error("SQLite source archive checksum mismatch");
const zip = resolve(folder, "source.zip");
writeFileSync(zip, archive);
execFileSync("unzip", ["-o", "-q", zip, "-d", folder]);
const source = resolve(folder, "sqlite-amalgamation-3530400/sqlite3.c");
if (digest(readFileSync(source), "sha3-256") !== manifest.source.amalgamationSha3)
  throw new Error("SQLite amalgamation checksum mismatch");
const slices: Record<string, string> = {};
for (const architecture of ["arm64", "x86_64"]) {
  const file = resolve(folder, `${architecture}.dylib`);
  execFileSync(
    "xcrun",
    [
      "clang",
      ...manifest.build.flags,
      `-ffile-prefix-map=${resolve(folder, "sqlite-amalgamation-3530400")}=.`,
      "-arch",
      architecture,
      source,
      "-o",
      file,
    ],
    { stdio: "inherit" },
  );
}
const binary = resolve("native/sqlite/libsqlite3.dylib");
execFileSync("xcrun", [
  "lipo",
  "-create",
  resolve(folder, "arm64.dylib"),
  resolve(folder, "x86_64.dylib"),
  "-output",
  binary,
]);
execFileSync("codesign", ["--force", "--sign", "-", "--timestamp=none", binary], {
  stdio: "inherit",
});
for (const architecture of ["arm64", "x86_64"]) {
  const slice = resolve(folder, `${architecture}-signed.dylib`);
  execFileSync("xcrun", ["lipo", binary, "-thin", architecture, "-output", slice]);
  slices[architecture] = digest(readFileSync(slice));
}
const compiler = execFileSync("xcrun", ["clang", "--version"], { encoding: "utf8" }).split("\n")[0];
const sdk = execFileSync("xcrun", ["--sdk", "macosx", "--show-sdk-version"], {
  encoding: "utf8",
}).trim();
writeFileSync(
  "native/sqlite/manifest.json",
  `${JSON.stringify({ ...manifest, build: { ...manifest.build, compiler, sdk }, slices, sha256: digest(readFileSync(binary)) }, null, 2)}\n`,
);
process.stdout.write("Verified SQLite source; built and signed universal arm64/x64 library.\n");
