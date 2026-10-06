import { connectEngine } from "./worker-channel.ts";

declare const self: DedicatedWorkerGlobalScope;
declare const __STATS_RELEASE__: string;
connectEngine(self, {
  baseUrl: self.location.origin,
  fetch: self.fetch.bind(self),
  release: __STATS_RELEASE__,
});
