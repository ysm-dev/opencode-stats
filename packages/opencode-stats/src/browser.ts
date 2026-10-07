import { spawn } from "node:child_process";

export const openBrowser = (
  url: string,
  platform = process.platform,
  env = process.env,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const command =
      platform === "darwin" ? "open" : platform === "win32" ? "rundll32.exe" : "xdg-open";
    const args = platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
    const child = spawn(command, args, { env, detached: true, stdio: "ignore" });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
