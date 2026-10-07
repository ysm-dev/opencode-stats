import { createServer, type Server } from "node:http";

export const listen = async (socket: Server): Promise<number> => {
  await new Promise<void>((done) => socket.listen(0, "127.0.0.1", done));
  const address = socket.address();
  if (!address || typeof address === "string") throw new Error("No TCP address");
  return address.port;
};

export const closeServer = (socket: Server): Promise<void> =>
  new Promise((done) => {
    socket.closeAllConnections();
    socket.close(() => done());
  });

export const temporaryPort = async (): Promise<number> => {
  const socket = createServer();
  const port = await listen(socket);
  await new Promise<void>((done) => socket.close(() => done()));
  return port;
};
