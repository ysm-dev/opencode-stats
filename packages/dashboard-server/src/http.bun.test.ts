import * as Effect from "effect/Effect";
import { describe, expect, it, vi } from "vitest";
import { bunServer } from "./http.bun.ts";
import { startServer } from "./server.ts";

describe("Bun HTTP adapter on Node", () => {
  it("sanitizes uncoded failures from Bun's bind operation", async () => {
    vi.stubGlobal("Bun", {
      serve: () => {
        throw new Error("Synthetic private platform detail");
      },
    });
    try {
      await expect(
        Effect.runPromise(
          Effect.scoped(startServer("unused").pipe(Effect.provide(bunServer(22439)))),
        ),
      ).rejects.toMatchObject({ message: "Can't start: couldn't bind 127.0.0.1:22439." });
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("serves responses through Bun's callback and releases its listener", async () => {
    let handler: (request: Request) => Promise<Response>;
    const stop = vi.fn<() => Promise<void>>().mockResolvedValue();
    const serve = vi.fn<(options: { hostname: string; port: number }) => object>((options) => ({
      hostname: options.hostname,
      port: options.port,
      stop,
      reload: (next: { fetch: typeof handler }) => {
        handler = next.fetch;
      },
    }));
    vi.stubGlobal("Bun", { serve });
    try {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const origin = yield* startServer("unused");
            expect(origin).toBe("http://127.0.0.1:22439");
            const response = yield* Effect.promise(() =>
              handler(new Request(`${origin}/`, { headers: { Host: "foreign.test" } })),
            );
            expect(response.status).toBe(403);
            expect(response.headers.get("cross-origin-opener-policy")).toBe("same-origin");
          }).pipe(Effect.provide(bunServer(22439))),
        ),
      );
      expect(serve).toHaveBeenCalledWith(
        expect.objectContaining({ hostname: "127.0.0.1", port: 22439 }),
      );
      expect(stop).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
