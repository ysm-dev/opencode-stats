export function blockedSlices() {
  let enter!: () => void;
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  let work = 0;
  return {
    entered: new Promise<void>((resolve) => {
      enter = resolve;
    }),
    release,
    clock: {
      workNow: () => (work += 4),
      yield: () => {
        enter();
        return waiting;
      },
    },
  };
}
