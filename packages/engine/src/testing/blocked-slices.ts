export function blockedSlices() {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let work = 0;
  return {
    entered: entered.promise,
    release: release.resolve,
    clock: {
      workNow: () => (work += 4),
      yield: () => {
        entered.resolve();
        return release.promise;
      },
    },
  };
}
