# The dashboard offers every OpenCode theme, each held to AA

The brief asks for the look and feel of OpenCode's web app, whose settings let its user pick any of `@opencode/ui`'s named themes, drawn light, dark or following the system. So the dashboard offers the same themes, with OpenCode's names, order and defaults (OpenCode's own theme, following the system), applied by `@opencode/ui`'s `ThemeProvider` as published and kept by the browser as preferences. Each theme builds its own colour ramps from about ten seed colours, and none of the 72 palettes (36 themes, light and dark) passes WCAG 2.2 AA as OpenCode draws it, so ADR 0014's promise is kept theme by theme: for each use the dashboard makes of colour (text tones, warning, focus ring, control edges, chart marks), it takes the theme's own colour where that passes and otherwise the nearest passing step of the same ramp in that theme, leaving the theme itself untouched. Two cases have no passing step and get a named change instead, still in the theme's own colours: in 18 light palettes the inverse background darkens by one or two grey steps, and in Everforest and Solarized light, muted text on raised surfaces takes the theme's base text. Charts keep one set of series, token-kind and outcome colours in every theme, because the themes' own ramps can't keep seven series apart; only the contribution graph's four levels, one hue in four shades, follow the theme's interactive colour.

## Considered Options

- **OpenCode's own theme only.** AA would rest on one checked palette, but the dashboard would look unlike the OpenCode its users have themed.
- **Every theme exactly as OpenCode draws it, with AA promised for OpenCode's own theme only.** The other 35 would be a public gap, though every one of them can pass in its own colours.
- **Chart colours from each theme's ramps.** Series fall below a colour difference (CIEDE2000) of 10 in 60 of the 72 palettes, and in all 72 under simulated colour blindness; 39 palettes build two ramps from the same or nearly the same seed; and no single series order keeps confusable colours apart in every theme.

## Consequences

- A unit test checks all 72 palettes: text, warning, focus and edges against each surface they're drawn on, chart marks against each theme's chart surface, the contribution levels in order, and neighbouring series kept apart. An `@opencode/ui` upgrade that adds or changes a theme passes through it like any other change, and one that leaves a use with no passing step blocks the merge until a change is decided by name.
- The real-browser accessibility checks run OpenCode's own theme and the two hardest light palettes, Matrix and Everforest.
- Every theme ships in the one bundle (Vite's `codeSplitting: false`, about 12 KB gzipped), so a theme change never waits on the network, and a theme or colour-scheme change appears whole within a frame like any other change (ADR 0007).
- The dashboard's Dracula is not exactly OpenCode's: where one of its colours fails a use, the dashboard draws that use a step or two darker or lighter, and its chart series wear the dashboard's own colours.
- The dashboard's startup script, not `ThemeProvider`, checks what the browser has stored, since `ThemeProvider` takes a stored colour scheme unchecked and throws when the browser refuses storage.
