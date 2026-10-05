import { createServer } from "node:http";
import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { publishRecord, stateFolder } from "@opencode-stats/launcher";
import { closeServer, listen, serverRecord } from "@opencode-stats/launcher/testing";
import { fixture } from "../testing/server.ts";
import { run } from "./main.ts";

it.each(
  (["override", "environment", "service", "default"] as const).flatMap((source) =>
    [false, true].map((racing) => ({ source, racing })),
  ),
)(
  "keeps $source selection provenance and canonical running identity when joining, racing=$racing",
  async ({ source, racing }) => {
    vi.stubGlobal("Bun", { version: "1.4.2" });
    const files = await fixture("process.stdout.write('waiting\\n'); process.exit(0);");
    const fallback = join(files.folder, "unused-process-environment");
    for (const key of [
      "HOME",
      "USERPROFILE",
      "XDG_STATE_HOME",
      "XDG_CACHE_HOME",
      "XDG_DATA_HOME",
      "XDG_CONFIG_HOME",
      "OPENCODE_CONFIG_DIR",
      "OPENCODE_DB",
    ])
      vi.stubEnv(key, fallback);
    vi.stubEnv("PATH", files.folder);
    const env = { ...files.env, PATH: files.folder };
    const data = join(files.folder, "data/opencode");
    mkdirSync(data, { recursive: true });
    const alias = join(files.folder, "data-alias");
    symlinkSync(
      join(files.folder, "data"),
      alias,
      process.platform === "win32" ? "junction" : "dir",
    );
    const selected = join(alias, "opencode", source === "default" ? "opencode.db" : "synthetic.db");
    writeFileSync(selected, "synthetic source");
    writeFileSync(
      files.script,
      `if (process.argv[process.argv.indexOf('--db') + 1] !== ${JSON.stringify(selected)}) { process.stderr.write('Wrong selected database\\n'); process.exit(1); } process.stdout.write('waiting\\n'); process.exit(0);`,
    );
    env.XDG_DATA_HOME = alias;
    const args = ["--no-open"];
    if (source === "override") args.push("--db", selected);
    if (source === "environment") Object.assign(env, { OPENCODE_DB: selected });
    if (source === "service")
      writeFileSync(
        join(files.folder, "service.json"),
        JSON.stringify({ env: { OPENCODE_DB: selected } }),
      );
    let record = serverRecord(0, {
      version: "99.0.0",
      starter: "terminal",
      database: realpathSync(selected),
    });
    let answering = !racing;
    const server = createServer((request, response) => {
      expect(request.headers.authorization).toBe(`Bearer ${record.secret}`);
      response.end(JSON.stringify(answering ? record : {}));
    });
    record = { ...record, address: `http://127.0.0.1:${await listen(server)}` };
    publishRecord(stateFolder(env), record);
    const output = vi.spyOn(process.stdout, "write").mockImplementation((value) => {
      if (value === "waiting\n") {
        answering = true;
        writeFileSync(
          join(files.folder, "service.json"),
          JSON.stringify({ env: { OPENCODE_DB: join(files.folder, "later.db") } }),
        );
      }
      return true;
    });
    const error = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const labels = {
      override: "(from `--db`)",
      environment: "(`OPENCODE_DB`)",
      service: "(`OPENCODE_DB` in OpenCode's service config)",
      default: "(OpenCode's data folder)",
    };
    try {
      expect(
        await run(args, {
          env,
          ...(racing
            ? { executable: files.executable, script: files.script }
            : { executable: "/must-not-spawn" }),
        }),
      ).toBe(0);
      const identity = `opencode-stats 99.0.0 · ${record.address} · already running, started in a terminal\nDatabase: ${record.database} ${labels[source]}\n`;
      expect(output.mock.calls).toEqual(racing ? [["waiting\n"], [identity]] : [[identity]]);
      expect(error).not.toHaveBeenCalled();
    } finally {
      await closeServer(server);
      output.mockRestore();
      error.mockRestore();
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      await files.clean();
    }
  },
);
