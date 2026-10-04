import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";

export const fixture = async (body: string) => {
  const folder = await mkdtemp(join(tmpdir(), "stats-bin-"));
  const executable = join(folder, "host");
  const script = join(folder, "server.mjs");
  await writeFile(
    executable,
    `#!${process.execPath}\nconst i=process.argv.indexOf('--no-install')+1; const script=process.argv[i]; process.argv=['node',script,...process.argv.slice(i+1)]; import(require('node:url').pathToFileURL(script).href);`,
    { mode: 0o700 },
  );
  await writeFile(script, body);
  const socket = createServer();
  await new Promise<void>((done) => socket.listen(0, "127.0.0.1", done));
  const address = socket.address();
  if (!address || typeof address === "string") throw new Error("No TCP address");
  await new Promise<void>((done) => socket.close(() => done()));
  return {
    executable,
    script,
    folder,
    port: address.port,
    clean: () => rm(folder, { recursive: true, force: true }),
  };
};

export const serving = `import {createServer} from 'node:http'; const server=createServer((req,res)=>res.end(String(process.pid))); server.listen(Number(process.argv[3]),'127.0.0.1',()=>process.stdout.write('opencode-stats-ready\\n')); process.on('SIGINT',()=>server.close(()=>process.exit(0)));`;

export const installOpener = async (folder: string): Promise<string> => {
  const record = join(folder, "opened");
  const command = process.platform === "darwin" ? "open" : "xdg-open";
  await writeFile(
    join(folder, command),
    `#!${process.execPath}\nrequire('node:fs').appendFileSync(${JSON.stringify(record)},process.argv[2]+'\\n');`,
    { mode: 0o700 },
  );
  return record;
};
