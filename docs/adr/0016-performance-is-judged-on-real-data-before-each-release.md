# Performance is judged on real data before each release

ADR 0007's budgets hold on the maintainer's OpenCode database, which CI can never read, and GitHub's hosted runners are shared machines without a GPU: Ubuntu's timings were steady across runs, but on a hosted macOS runner the p95 of one case ranged from 63 to 97 ms. A gate must never fail at random. So the budgets are judged in a reference run before each release: `bun run perf` on the maintainer's Mac installs the packed tarball and runs a seeded tour of every kind of change, with loads, starts, OpenCode writes and a build, against an APFS clone of the real OpenCode database, in Chromium and WebKit at 360 px with touch and 1280 px with a mouse. It writes `docs/performance/<version>.md`, holding only counts, sizes and timings, which the release PR commits, and `publish.yml` refuses to publish without a passing report whose measured commit matches the tag in everything shipped. On every pull request, CI blocks on what doesn't depend on machine speed: four checks of ADR 0007's rule, in Chromium and WebKit. It also blocks on Ubuntu Chromium when any timing is worse than three times its limit, on a synthetic OpenCode database built from a committed profile of the maintainer's.

## Considered Options

- **Timing gates at the budgets in CI.** CI can't read the maintainer's database, its runners aren't the maintainer's machine, and hosted macOS runners vary several-fold between runs.
- **A self-hosted runner on the maintainer's Mac.** GitHub advises against self-hosted runners for public repositories, since pull requests from forks run code on them, and the machine is in daily use.
- **The pull request's tarball against main's, interleaved in CI.** Twice the job, and a statistical test still flags slowdowns that aren't there.
- **A checklist item in the release PR,** like the VoiceOver walkthrough (ADR 0014). Nothing would stop a release whose numbers were never measured.

## Consequences

- CI's four checks fail when a painted frame mixes states, a change the user makes sends a request, a load paints before its page is complete, or anything animates.
- A release needs a reference run of about two hours, unattended. An agent session can run it, and only the cold-disk measurements need the maintainer, for `sudo purge`. It won't start while the machine is busy.
- What's judged is the dashboard's own change times (ADR 0007). A Chromium trace in the run must agree with them, or the run fails: a clock that under-reports would pass everything.
- The run refreshes the committed profile of the maintainer's database (counts, cardinalities and distributions, with no time-of-day pattern), so CI's synthetic database follows the real one release by release. Anything that writes, writes only to the clone.
- Firefox, a synthetic database twice the maintainer's, and Chromium with its accessibility tree on are measured and reported, never judged.
- Memory, CPU, sizes and a build's milestones are reported beside the previous release's, never capped.
- A slowdown under CI's limit is found at the next release, which waits for the fix.
- The budgets' limits, the profile and `docs/performance/` are in CODEOWNERS, like every file that configures or proves a gate.
