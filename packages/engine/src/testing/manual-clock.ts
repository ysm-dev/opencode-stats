export function manualClock() {
  let now = new Date(2026, 9, 7, 14, 2).getTime();
  const listeners = new Set<() => void>();
  return {
    now: () => now,
    everySecond: (update: () => void) => {
      listeners.add(update);
      return () => {
        listeners.delete(update);
      };
    },
    advance: async (seconds: number) => {
      // Let Effect deliver already-completed stream/fetch work before moving time.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      for (let index = 0; index < seconds; index++) {
        now += 1000;
        for (const update of listeners) update();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    },
    get ticking() {
      return listeners.size;
    },
  };
}
