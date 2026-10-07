// The isolated channel shares only two elapsed times and an atomic ready flag.
// Completing the record *after* postMessage measures its actual synchronous
// clone once, without another serialization or a timing-acknowledgement chain.
export function createPostClock() {
  const data = new Uint8Array(new SharedArrayBuffer(20));
  const parts = new Float64Array(data.buffer, 0, 2);
  const ready = new Int32Array(data.buffer, 16, 1);
  return {
    data,
    complete: (compute: number, elapsed: number) => {
      parts[0] = compute;
      parts[1] = elapsed;
      Atomics.store(ready, 0, 1);
    },
  };
}

// The binary object has been narrowed by the channel schema; its shared layout
// and numeric contents are still untrusted until this boundary checks them.
export function readPostClock(data: Uint8Array) {
  if (
    !(data.buffer instanceof SharedArrayBuffer) ||
    data.byteOffset !== 0 ||
    data.byteLength !== 20
  )
    throw new Error("Invalid shared post clock");
  const ready = Atomics.load(new Int32Array(data.buffer, 16, 1), 0);
  if (ready === 0) return undefined;
  const parts = new Float64Array(data.buffer, 0, 2);
  if (ready !== 1 || !parts.every((part) => Number.isFinite(part) && part >= 0))
    throw new Error("Invalid shared post clock");
  return { compute: parts[0]!, elapsed: parts[1]! };
}
