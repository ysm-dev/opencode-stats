export type EngineClock = {
  now: () => number;
  workNow: () => number;
  yield: () => Promise<void>;
  everySecond: (update: () => void) => () => void;
  after: (milliseconds: number, update: () => void) => () => void;
};

export const systemClock: EngineClock = {
  now: () => Date.now(),
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
