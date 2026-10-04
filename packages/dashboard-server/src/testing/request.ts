import { request } from "node:http";

export const httpRequest = (
  url: string,
  options: { method: string; headers: Readonly<Record<string, string>> },
): Promise<Response> =>
  new Promise((resolve, reject) => {
    const outgoing = request(url, options, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
      incoming.on("error", reject);
      incoming.on("end", () => {
        const headers = new Headers();
        for (const [key, value] of Object.entries(incoming.headers)) {
          if (value !== undefined)
            headers.set(key, Array.isArray(value) ? value.join(", ") : value);
        }
        if (incoming.statusCode === undefined) throw new Error("Missing response status");
        resolve(new Response(Buffer.concat(chunks), { status: incoming.statusCode, headers }));
      });
    });
    outgoing.on("error", reject);
    outgoing.end();
  });
