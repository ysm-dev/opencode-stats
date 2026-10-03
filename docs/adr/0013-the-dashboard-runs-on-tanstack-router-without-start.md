# The dashboard runs on TanStack Router without Start

The dashboard renders only in the browser (ADR 0008), so TanStack Start's one job here was prerendering an empty page skeleton at build time. Start's production build can't run without the route tree its generator writes, and that file always contains `as any`, which the repo's `any` ban admits no exception for; turning the generator off makes Start's build fail in its route manifest instead. So the dashboard is TanStack Solid Router with hand-written routes on a plain Vite build: `index.html` is the skeleton, links and navigation stay typed, and every gate passes with no suppressions.

## Considered Options

- **Start, with an exception for its generated route tree.** The file fails lint nine times, `any` among them, and the `any` ban admits no exception.
- **Start, with hand-written routes and a patch to its route manifest.** A patch on a fast-moving framework, made again on every update.
- **Start's generator with `disableTypes`.** It writes JavaScript, which Start's own build then fails to parse, and the routes lose their types.

## Consequences

- The dashboard server serves `index.html` for page addresses, and the hashed assets.
- The release script (ADR 0012) builds the dashboard with Vite alone; nothing runs a server build.
- TanStack Router's `HeadContent` and devtools still work. Start's server rendering, server functions, server routes and prerendering are gone, and the dashboard used none of them.
