export type EngineClock = {
  now: () => number;
  timeZone: () => string;
  locale: () => string;
  workNow: () => number;
  yield: (sliceStarted: number) => Promise<void>;
  everySecond: (update: () => void) => () => void;
  after: (milliseconds: number, update: () => void) => () => void;
};

export const systemClock: EngineClock = {
  now: () => Date.now(),
  timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  locale: () => Intl.DateTimeFormat().resolvedOptions().locale,
  workNow: () => performance.now(),
  yield: () => new Promise((resolve) => setTimeout(resolve, 0)),
  everySecond: (update) => {
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  },
  after: (milliseconds, update) => {
    const timer = setTimeout(update, milliseconds);
    return () => clearTimeout(timer);
  },
};
