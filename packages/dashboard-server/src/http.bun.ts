import * as BunHttpServer from "@effect/platform-bun/BunHttpServer";
import { bind } from "./bind.ts";

export const bunServer = (port: number) =>
  // Close scoped SSE responses before awaiting Bun's listener shutdown.
  bind(
    BunHttpServer.layer({
      hostname: "127.0.0.1",
      port,
      idleTimeout: 0,
      disablePreemptiveShutdown: true,
    }),
    port,
  );
