import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import type { ServerRecord } from "../record.ts";

export const serverRecord = (
  port: number,
  overrides: Partial<ServerRecord> = {},
): ServerRecord => ({
  address: `http://127.0.0.1:${port}`,
  pid: 123,
  version: "1.3.0",
  database: "/synthetic/a.db",
  starter: "plugin",
  protocol: 1,
  secret: "a".repeat(64),
  ...overrides,
});

export async function stopProcess(pid: number): Promise<void> {
  process.kill(pid, "SIGTERM");
  for (;;) {
    await setImmediate();
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
  }
}

export const standIn = () => {
  const folder = mkdtempSync(join(tmpdir(), "launcher-stand-in-"));
  const executable = join(folder, "host");
  const db = join(folder, "synthetic.db");
  writeFileSync(db, "synthetic");
  mkdirSync(join(folder, "opencode-stats"));
  writeFileSync(
    executable,
    `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const folder = path.join(process.env.XDG_STATE_HOME, 'opencode-stats');
try { fs.closeSync(fs.openSync(path.join(folder, 'winner'), 'wx')); } catch { process.exit(0); }
const port = Number(process.argv[process.argv.indexOf('--port') + 1]);
const database = fs.realpathSync(process.argv[process.argv.indexOf('--db') + 1]);
const record = {address:'http://127.0.0.1:'+port,pid:process.pid,version:'1.3.0',database,starter:'plugin',protocol:1,secret:'a'.repeat(64)};
const server = http.createServer((req,res)=> { if(req.headers.authorization !== 'Bearer '+record.secret) {res.writeHead(403).end(); return; } if(req.url === '/api/hold') res.write('opencode-stats-hold/1\\n'); else res.end(JSON.stringify(record)); });
server.listen(port,'127.0.0.1',()=> {fs.writeFileSync(path.join(folder,'trace.json'),JSON.stringify({args:process.argv.slice(2),env:process.env}));fs.writeFileSync(path.join(folder,'server.tmp'),JSON.stringify(record));fs.renameSync(path.join(folder,'server.tmp'),path.join(folder,'server.json'));});
`,
    { mode: 0o700 },
  );
  return {
    folder,
    db,
    executable,
    script: join(folder, "server.ts"),
    env: { XDG_STATE_HOME: folder, API_KEY: "synthetic-secret" },
    clean: () => rmSync(folder, { recursive: true }),
  };
};
