import { connectEngine } from "./worker-channel.ts";

declare const self: DedicatedWorkerGlobalScope;
connectEngine(self, { baseUrl: self.location.origin, fetch: self.fetch.bind(self) });
