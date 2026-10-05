# Dashboard

The Overview tracer bullet draws the engine's complete all-history Tokens state.
The page client uses the real module worker exported by `@opencode-stats/engine`;
the page never fetches facts or computes metrics. TanStack's hand-written typed
Overview route remains the routing boundary. Other pages and range controls land
with their feature tickets, rather than drawing empty placeholder pages.

`Dashboard({ client, ready })` and `mountDashboard(root, client, ready)` wait for
both the engine answer and font readiness, preload the engine's router address,
then reveal the shell and Tokens together. The linked global stylesheet blocks
initial rendering; `index.html` contains no early dashboard content. Disposing
the dashboard disconnects its page client.

jsdom user-event tests pass the real in-thread engine and browser-copy's in-memory
HttpApi server. Axe rejects both violations and incomplete checks; only its
layout-dependent colour check is disabled in jsdom. Packed/source Chromium checks
run axe including contrast, hold copy/fonts/styles, observe frames, and exercise
the real worker at 360 px and 1280 px. `bun run dev` uses the stats-store builder's
synthetic database and the same Overview from source.
