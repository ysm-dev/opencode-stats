import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";

export function capture(child: ChildProcessWithoutNullStreams) {
  const transcript = { output: "", error: "" };
  child.stdout.on("data", (chunk: Buffer) => {
    transcript.output += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    transcript.error += chunk.toString();
  });
  return { transcript, closed: once(child, "close") };
}
