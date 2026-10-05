import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { temporaryPort } from "@opencode-stats/launcher/testing";
import { syntheticDatabase } from "@opencode-stats/stats-store/testing";
import { watch } from "node:fs";

export const fixture = async (body: string) => {
  const folder = await mkdtemp(join(tmpdir(), "stats-bin-"));
  const executable = join(folder, "host");
  const script = join(folder, "server.mjs");
  const db = join(folder, "synthetic.db");
  syntheticDatabase(db).close();
  await writeFile(
    executable,
    `#!${process.execPath}\nconst i=process.argv.indexOf('--no-install')+1; const script=process.argv[i]; process.argv=['node',script,...process.argv.slice(i+1)]; import(require('node:url').pathToFileURL(script).href);`,
    { mode: 0o700 },
  );
  await writeFile(script, body);
  return {
    executable,
    script,
    folder,
    db,
    port: await temporaryPort(),
    clean: () => rm(folder, { recursive: true, force: true }),
  };
};

export const serving = `import {createServer} from 'node:http'; const server=createServer((req,res)=>res.end(String(process.pid))); server.listen(Number(process.argv[3]),'127.0.0.1',()=>process.stdout.write('opencode-stats-ready\\n')); process.on('SIGINT',()=>server.close(()=>process.exit(0)));`;

export const installOpener = async (folder: string, beforeAppendPort?: number) => {
  const record = join(folder, "opened");
  const exited = join(folder, "opened.exit");
  const observer = watch(folder);
  const completed = new Promise<void>((done, reject) => {
    observer.once("error", reject);
    // The append target can be visible before its write. Only the atomic exit marker
    // establishes that all fixture writes finished and cleanup can safely begin.
    observer.on("change", (_event, file) => {
      if (file === "opened.exit") done();
    });
  });
  const command = process.platform === "darwin" ? "open" : "xdg-open";
  await writeFile(
    join(folder, command),
    `#!${process.execPath}\nconst fs=require('node:fs'); const record=${JSON.stringify(record)}; const exited=${JSON.stringify(exited)}; process.on('exit',code=>{fs.writeFileSync(exited+'.tmp',JSON.stringify({code}));fs.renameSync(exited+'.tmp',exited);}); const append=()=>fs.appendFileSync(record,process.argv[2]+'\\n'); const port=${JSON.stringify(beforeAppendPort ?? null)}; if(port===null)append();else{fs.closeSync(fs.openSync(record,'a'));const socket=require('node:net').connect(port,'127.0.0.1');socket.on('connect',()=>socket.write('created\\n'));socket.on('data',()=>{append();socket.end();});}`,
    { mode: 0o700 },
  );
  return { record, exited, completed, close: () => observer.close() };
};
