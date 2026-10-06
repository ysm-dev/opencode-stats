import * as Effect from "effect/Effect";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";
import type { CopyCursor, LiveAnnouncement } from "./api.ts";
import { formatVersion } from "./binary.ts";

export function createLiveFeed(current: () => CopyCursor, release: string) {
  const announcements = Effect.runSync(PubSub.sliding<void>(1));
  let latest: CopyCursor | undefined;
  const stream = Stream.unwrap(
    Effect.gen(function* () {
      // Subscribe before reading the opening cursor so a simultaneous commit cannot disappear.
      const subscription = yield* PubSub.subscribe(announcements);
      const { generation, revision } = current();
      const opening: LiveAnnouncement = { generation, revision, release, format: formatVersion };
      const revisions = Stream.mapEffect(Stream.fromSubscription(subscription), () =>
        Effect.map(Effect.yieldNow, () => latest!),
      );
      return Stream.concat(Stream.make(opening), revisions);
    }),
  );
  return {
    stream,
    announce: ({ generation, revision }: CopyCursor) => {
      latest = { generation, revision };
      PubSub.publishUnsafe(announcements, undefined);
    },
    close: () => Effect.runPromise(PubSub.shutdown(announcements)),
  };
}
