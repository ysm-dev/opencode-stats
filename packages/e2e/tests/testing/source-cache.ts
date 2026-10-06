import { existsSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { createServer } from "node:net";

export async function coldSourceCache() {
  for (const port of [5173, 22440]) {
    const socket = createServer();
    await new Promise<void>((done, reject) => {
      socket.once("error", reject);
      socket.listen(port, "127.0.0.1", done);
    });
    await new Promise<void>((done) => socket.close(() => done()));
  }
  const cache = resolve("packages/dashboard/node_modules/.vite");
  if (existsSync(cache) && !realpathSync(cache).startsWith(realpathSync(process.cwd()) + sep))
    throw new Error("Refusing to move a Vite cache outside this source worktree");
  mkdirSync(".dev", { recursive: true });
  const folder = mkdtempSync(resolve(".dev/source-e2e-cache-"));
  const saved = join(folder, "saved");
  if (existsSync(cache)) renameSync(cache, saved);
  return () => {
    rmSync(cache, { recursive: true, force: true });
    if (existsSync(saved)) renameSync(saved, cache);
    rmSync(folder, { recursive: true, force: true });
  };
}
