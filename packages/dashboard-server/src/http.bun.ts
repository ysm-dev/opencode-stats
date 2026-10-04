import * as BunHttpServer from "@effect/platform-bun/BunHttpServer";
import { bind } from "./bind.ts";

export const bunServer = (port: number) =>
  bind(BunHttpServer.layer({ hostname: "127.0.0.1", port }), port);
