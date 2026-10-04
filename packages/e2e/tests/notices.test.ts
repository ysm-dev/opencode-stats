import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";

it("generates asset license notices from a symlinked isolated dependency tree", async () => {
  // Stay outside the repo and its temporary workspace ancestors: their node_modules can hide this failure.
  const folder = await mkdtemp(join(tmpdir(), "stats-isolated-notices-"));
  const installed = join(folder, "store/node_modules");
  const ui = join(installed, "@opencode/ui");
  const projects = resolve(".dev");
  await mkdir(projects, { recursive: true });
  // Windows CI puts this checkout on D: and its temp/store on C:, preserving the real cross-drive case.
  const project = await mkdtemp(join(projects, "notice-project-"));
  const scope = join(project, "packages/dashboard/node_modules/@opencode");
  const entry = pathToFileURL(resolve("scripts/release-notices.ts")).href;
  try {
    await mkdir(ui, { recursive: true });
    await mkdir(join(installed, "katex"));
    await mkdir(scope, { recursive: true });
    await writeFile(join(ui, "package.json"), JSON.stringify({ name: "@opencode/ui" }));
    await writeFile(
      join(installed, "katex/package.json"),
      JSON.stringify({ name: "katex", version: "1.0.0" }),
    );
    await writeFile(join(installed, "katex/LICENSE"), "Synthetic font license\n");
    const source = join(installed, "katex/index.js");
    await writeFile(source, "export const synthetic = 1;\n");
    await symlink(ui, join(scope, "ui"), process.platform === "win32" ? "junction" : "dir");
    const output = execFileSync(
      "bun",
      [
        "--no-env-file",
        "--no-install",
        "-e",
        `const {notices}=await import(${JSON.stringify(entry)}); process.stdout.write(notices([], ["../../../../node_modules/katex/dist/fonts/synthetic.woff2"]));`,
      ],
      { cwd: project, encoding: "utf8", stdio: "pipe" },
    );
    expect(output).toBe("## katex 1.0.0\n\nSynthetic font license\n\n");
    const fromMetafile = (file: string): string =>
      execFileSync(
        "bun",
        [
          "--no-env-file",
          "--no-install",
          "-e",
          `const {notices}=await import(${JSON.stringify(entry)}); process.stdout.write(notices([{inputs:{[${JSON.stringify(file)}]:{imports:[]}}}], []));`,
        ],
        { cwd: project, encoding: "utf8", stdio: "pipe" },
      );
    expect(fromMetafile(source)).toBe("## katex 1.0.0\n\nSynthetic font license\n\n");
    // Bun prepends parent segments even to an absolute input on another drive (D: checkout, C: cache).
    // The same encoding of an absolute root on POSIX keeps this regression runnable on every source host.
    expect(fromMetafile(`../../../../${source.replaceAll("\\", "/")}`)).toBe(
      "## katex 1.0.0\n\nSynthetic font license\n\n",
    );
    expect(() => fromMetafile(join(installed, "katex/missing.js"))).toThrow("ENOENT");
  } finally {
    await rm(project, { recursive: true, force: true });
    await rm(folder, { recursive: true, force: true });
  }
});
