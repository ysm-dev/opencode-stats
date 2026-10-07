import { connectEngine } from "./worker-channel.ts";
import { systemClock } from "./clock.ts";

declare const self: DedicatedWorkerGlobalScope;
declare const statsRelease: string;
connectEngine(
  self,
  {
    baseUrl: self.location.origin,
    fetch: self.fetch.bind(self),
    release: statsRelease,
  },
  systemClock,
);
