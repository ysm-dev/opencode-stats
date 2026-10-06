export function manualClock() {
  let now = new Date(2026, 9, 7, 14, 2).getTime();
  const timers = new Set<{ at: number; interval: number; update: () => void }>();
  const schedule = (milliseconds: number, update: () => void, interval = 0) => {
    const timer = { at: now + milliseconds, interval, update };
    timers.add(timer);
    return () => {
      timers.delete(timer);
    };
  };
  const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  return {
    now: () => now,
    everySecond: (update: () => void) => schedule(1000, update, 1000),
    after: schedule,
    advance: async (seconds: number) => {
      // Let Effect deliver already-completed stream/fetch work before moving time.
      await settle();
      const end = now + seconds * 1000;
      for (;;) {
        const timer = [...timers].toSorted((left, right) => left.at - right.at)[0];
        if (!timer || timer.at > end) break;
        now = timer.at;
        if (timer.interval) timer.at += timer.interval;
        else timers.delete(timer);
        timer.update();
        await settle();
      }
      now = end;
    },
    get ticking() {
      return timers.size;
    },
  };
}
