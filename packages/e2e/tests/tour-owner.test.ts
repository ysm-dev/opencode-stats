import { expect, it, vi } from "vitest";
import { createTourOwner, type TourScope } from "./testing/tour-owner.ts";

function ownedFixture() {
  const released = Promise.withResolvers<void>();
  const dispose = vi.fn<() => Promise<void>>(async () => {
    released.resolve();
  });
  return { resource: { [Symbol.asyncDispose]: dispose }, dispose, released: released.promise };
}

function unreadyFixtureOwner() {
  const fixture = ownedFixture();
  const setup = Promise.withResolvers<typeof fixture.resource>();
  const started = Promise.withResolvers<void>();
  const open = vi.fn<(scope: TourScope) => Promise<typeof fixture.resource>>(async (scope) => {
    started.resolve();
    return scope.use(setup.promise);
  });
  return { ...fixture, setup, started: started.promise, open, owner: createTourOwner(open) };
}

it("owns one setup promise and disposes an unready result arriving after failure", async () => {
  const fixture = unreadyFixtureOwner();
  await using owner = fixture.owner;
  const use = vi.fn<(value: typeof fixture.resource, signal: AbortSignal) => Promise<void>>(
    async () => {},
  );
  const first = owner.run(use);
  const canceled = expect(first).rejects.toThrow("tour:previous-case-failed-or-closed");
  await fixture.started;
  owner.fail();
  await canceled;
  await expect(owner.run(use)).rejects.toThrow("tour:previous-case-failed-or-closed");
  expect(fixture.open).toHaveBeenCalledOnce();
  fixture.setup.resolve(fixture.resource);
  await fixture.released;
  expect(fixture.dispose).toHaveBeenCalledOnce();
  expect(use).not.toHaveBeenCalled();
});

it("cancels a failed active round before dependent reuse or post-await effects", async () => {
  const fixture = ownedFixture();
  const waiting = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  const settled = Promise.withResolvers<void>();
  const effects = vi.fn<() => void>();
  await using owner = createTourOwner((scope) => scope.use(Promise.resolve(fixture.resource)));
  const first = owner.run(async (_resource, signal) => {
    started.resolve();
    try {
      await waiting.promise;
      signal.throwIfAborted();
      effects();
    } finally {
      settled.resolve();
    }
  });
  const canceled = expect(first).rejects.toThrow("tour:previous-case-failed-or-closed");
  await started.promise;
  owner.fail();
  await canceled;
  await fixture.released;
  const next = vi.fn<(resource: typeof fixture.resource, signal: AbortSignal) => Promise<void>>(
    async () => {},
  );
  await expect(owner.run(next)).rejects.toThrow("tour:previous-case-failed-or-closed");
  waiting.resolve();
  await settled.promise;
  expect(effects).not.toHaveBeenCalled();
  expect(next).not.toHaveBeenCalled();
  expect(fixture.dispose).toHaveBeenCalledOnce();
});

it("reuses only a successful fixture and closes it once", async () => {
  const fixture = ownedFixture();
  const open = vi.fn<Parameters<typeof createTourOwner<typeof fixture.resource>>[0]>((scope) =>
    scope.use(Promise.resolve(fixture.resource)),
  );
  const owner = createTourOwner(open);
  expect(await owner.run(async (resource) => resource)).toBe(fixture.resource);
  expect(await owner.run(async (resource) => resource)).toBe(fixture.resource);
  expect(open).toHaveBeenCalledOnce();
  await owner[Symbol.asyncDispose]();
  await owner[Symbol.asyncDispose]();
  expect(fixture.dispose).toHaveBeenCalledOnce();
  await expect(owner.run(async (resource) => resource)).rejects.toThrow(
    "tour:previous-case-failed-or-closed",
  );
});

it("preserves failed initialization and refuses another opener", async () => {
  const original = new Error("planted original setup failure");
  const open = vi.fn<(scope: TourScope) => Promise<number>>().mockRejectedValue(original);
  await using owner = createTourOwner(open);
  await expect(owner.run(async (value) => value)).rejects.toBe(original);
  await expect(owner.run(async (value) => value)).rejects.toThrow(
    "tour:previous-case-failed-or-closed",
  );
  expect(open).toHaveBeenCalledOnce();
});

it("preserves the original body failure independently of cleanup failure", async () => {
  const original = new Error("planted original round failure");
  const cleanup = new Error("planted owned cleanup failure");
  const dispose = vi.fn<() => Promise<void>>().mockRejectedValue(cleanup);
  const owner = createTourOwner((scope) =>
    scope.use(Promise.resolve({ [Symbol.asyncDispose]: dispose })),
  );
  await expect(
    owner.run(async () => {
      throw original;
    }),
  ).rejects.toBe(original);
  await expect(owner[Symbol.asyncDispose]()).rejects.toBe(cleanup);
  expect(dispose).toHaveBeenCalledOnce();
});

it("poisons overlapping dependent cases rather than opening another fixture", async () => {
  const fixture = unreadyFixtureOwner();
  await using owner = fixture.owner;
  const first = owner.run(async (resource) => resource);
  const canceled = expect(first).rejects.toThrow("tour:previous-case-failed-or-closed");
  await fixture.started;
  await expect(owner.run(async (resource) => resource)).rejects.toThrow(
    "tour:overlapping-dependent-case",
  );
  await canceled;
  fixture.setup.resolve(fixture.resource);
  await fixture.released;
  expect(fixture.open).toHaveBeenCalledOnce();
  expect(fixture.dispose).toHaveBeenCalledOnce();
});
