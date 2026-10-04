import { createServer } from "node:http";
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import { bind } from "./bind.ts";

export const nodeServer = (port: number) =>
  bind(NodeHttpServer.layer(createServer, { host: "127.0.0.1", port }), port);
