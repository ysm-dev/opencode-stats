import { createServer } from "node:http";

export const temporaryPort = async (): Promise<number> => {
  const socket = createServer();
  await new Promise<void>((done) => socket.listen(0, "127.0.0.1", done));
  const address = socket.address();
  if (!address || typeof address === "string") throw new Error("No TCP address");
  await new Promise<void>((done) => socket.close(() => done()));
  return address.port;
};
