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
  const project = join(folder, "project");
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
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
