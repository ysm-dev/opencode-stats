// Both CI matrices use one-based index/count notation; no argument means a full run.
export const shard = <T>(items: readonly T[], value: string | undefined): readonly T[] => {
  if (value === undefined) return items;
  if (!/^[1-9]\d*\/[1-9]\d*$/u.test(value)) throw new Error(`Invalid shard: ${value}`);
  const [index = 0, count = 0] = value.split("/").map(Number);
  if (!Number.isSafeInteger(index) || !Number.isSafeInteger(count) || index > count)
    throw new Error(`Invalid shard: ${value}`);
  return items.filter((_, position) => position % count === index - 1);
};
