import * as Effect from "effect/Effect";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";
import type { CopyCursor, LiveAnnouncement } from "./api.ts";
import { formatVersion } from "./binary.ts";

export function createLiveFeed(current: () => CopyCursor, release: string) {
  const announcements = Effect.runSync(PubSub.sliding<CopyCursor>(1));
  const stream = Stream.unwrap(
    Effect.gen(function* () {
      // Subscribe before reading the opening cursor so a simultaneous commit cannot disappear.
      const subscription = yield* PubSub.subscribe(announcements);
      const { generation, revision } = current();
      const opening: LiveAnnouncement = { generation, revision, release, format: formatVersion };
      return Stream.concat(Stream.make(opening), Stream.fromSubscription(subscription));
    }),
  );
  return {
    stream,
    announce: ({ generation, revision }: CopyCursor) => {
      PubSub.publishUnsafe(announcements, { generation, revision });
    },
    close: () => Effect.runPromise(PubSub.shutdown(announcements)),
  };
}
