import * as Schema from "effect/Schema";
import { LiveAnnouncement } from "@opencode-stats/browser-copy/api";

export async function liveEvents(origin: string) {
  const response = await fetch(`${origin}/api/browser-copy/live`);
  const reader = response.body!.getReader();
  let buffered = "";
  return {
    close: () => reader.cancel(),
    read: async () => {
      while (!buffered.includes("\n\n")) {
        const chunk = await reader.read();
        if (chunk.done) throw new Error("Synthetic live stream ended.");
        buffered += new TextDecoder().decode(chunk.value);
      }
      const end = buffered.indexOf("\n\n");
      const event = buffered.slice(0, end);
      buffered = buffered.slice(end + 2);
      return Schema.decodeUnknownSync(LiveAnnouncement)(
        JSON.parse(
          event
            .split("\n")
            .find((line) => line.startsWith("data:"))!
            .slice(5),
        ),
      );
    },
  };
}
