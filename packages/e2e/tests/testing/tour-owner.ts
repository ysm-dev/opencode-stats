type Scope = {
  signal: AbortSignal;
  use: <T extends AsyncDisposable>(resource: Promise<T>) => Promise<T>;
};
export type TourScope = Scope;

const unavailable = () => new Error("tour:previous-case-failed-or-closed");
function observeCleanup(cleanup: Promise<void>) {
  void cleanup.catch(() => {
    process.stderr.write("tour:owned-cleanup-failed\n");
  });
  return cleanup;
}

// A timed-out Vitest body still runs. Own its one setup promise and all acquired
// resources independently of that body, and poison the owner before disposing.
export function createTourOwner<T>(open: (scope: Scope) => Promise<T>) {
  const resources = new AsyncDisposableStack();
  const controller = new AbortController();
  const stopped = Promise.withResolvers<never>();
  let initialization: Promise<T> | undefined;
  let closing: Promise<void> | undefined;
  let active = false;
  // This promise can reject before a body races it, or after the test finished.
  void stopped.promise.catch(() => {});
  const close = () => {
    if (!controller.signal.aborted) {
      controller.abort(unavailable());
      stopped.reject(unavailable());
    }
    closing ??= observeCleanup(resources.disposeAsync());
    return closing;
  };
  const scope: Scope = {
    signal: controller.signal,
    use: async (pending) => {
      const resource = await pending;
      if (controller.signal.aborted) {
        await observeCleanup(Promise.resolve().then(() => resource[Symbol.asyncDispose]()));
        throw unavailable();
      }
      return resources.use(resource);
    },
  };
  const get = () => {
    initialization ??= Promise.resolve().then(() => {
      controller.signal.throwIfAborted();
      return open(scope);
    });
    // Preserve the original rejection for the body, but also observe it if the
    // timeout has already won and no caller remains to consume late setup.
    void initialization.catch(() => {});
    return initialization;
  };
  return {
    fail: () => {
      void close();
    },
    run: async <R>(work: (fixture: T, signal: AbortSignal) => Promise<R>): Promise<R> => {
      controller.signal.throwIfAborted();
      if (active) {
        void close();
        throw new Error("tour:overlapping-dependent-case");
      }
      active = true;
      const task = async () => {
        const fixture = await get();
        controller.signal.throwIfAborted();
        const result = await work(fixture, controller.signal);
        controller.signal.throwIfAborted();
        return result;
      };
      try {
        return await Promise.race([task(), stopped.promise]);
      } catch (original) {
        void close();
        throw original;
      } finally {
        active = false;
      }
    },
    [Symbol.asyncDispose]: close,
  };
}
