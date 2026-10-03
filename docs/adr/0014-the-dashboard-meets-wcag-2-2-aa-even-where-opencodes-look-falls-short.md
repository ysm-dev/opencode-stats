# The dashboard meets WCAG 2.2 AA, even where OpenCode's look falls short

The brief asks for the look and feel of OpenCode's web app, and the dashboard is published for anyone who uses OpenCode, including people who rely on a screen reader, the keyboard, zoom or high contrast. OpenCode's colours fall short of WCAG exactly where a dashboard of small numbers and dense charts leans on them: in `@opencode/ui`'s oc-2 theme, faint text is 3.40–3.95:1 on every light surface, the warning yellow 2.12–2.46:1 and the focus blue 2.36–2.73:1 in light mode, and control edges 1.17–1.92:1. So the dashboard promises WCAG 2.2 Level AA for everything it draws, the problem screen included, with no exceptions beyond WCAG's own, and says so in the README. Where OpenCode's look and the promise disagree, the promise wins, through the nearest change that passes, taken from OpenCode's own colour ramps. Any further gap must be decided by name and listed publicly.

## Considered Options

- **OpenCode's look, exactly.** The dashboard would inherit OpenCode's failures and add its own: four of the prototype's eight light-mode series colours, every faded partial bucket and the first two contribution levels fall below 3:1.
- **AA as a best-effort aim, with no public promise.** Nothing would stop a palette change or a new control from quietly undoing it.
- **Level A only.** It leaves out contrast, reflow, text spacing, target size and status messages, which a dashboard of small numbers and dense charts needs most.
- **A palette of our own, tuned per surface.** It could keep OpenCode's third text tone, but OpenCode has no light-mode grey between faint and muted, so it would mean colours off OpenCode's ramps that drift from them as OpenCode changes.

## Consequences

- Faint text never carries information, so the dashboard has two text tones, base and muted. In light mode, warning text is yellow-1100 and the focus ring blue-600; dark mode keeps OpenCode's. The edges and marks that show a control or its state, and every chart colour, reach 3:1 against what they sit on.
- A unit test checks every text, mark, edge and focus colour against each surface it's drawn on, in light and dark, so neither a palette change nor an `@opencode/ui` upgrade can lower contrast unnoticed. Component and real-browser checks of structure, reflow, text spacing and target sizes block merges too.
- WCAG's Level A rules shape features as well as looks: live updates can be paused, and single-key shortcuts switched off.
- Before each release that changes the dashboard, someone walks through it by hand with VoiceOver in Safari and Chrome, and with the keyboard alone. NVDA, Orca and Windows high-contrast mode are best-effort.
