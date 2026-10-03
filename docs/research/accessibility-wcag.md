# Dashboard accessibility: primary-source findings

Research date: **3 October 2026**. Originating question: [issue #25, “What accessibility does the dashboard promise?”](https://github.com/ysm-dev/opencode-stats/issues/25).

Scope: the local, loopback-only single-page statistics dashboard described in the research request: six views, responsive sidebar/phone shell, fixed top/range bars, bottom filter sheet, command menu, dense charts and heatmaps, sideways-scrolling tables/calendar, virtualised fixed-height rows, character shortcuts, and periodically refreshed data. This is fact-finding, not a conformance assessment or a product recommendation. “Application” below means applying the cited rule to that described behaviour; actual conformance depends on the implementation.

## Source authority

- The [WCAG 2.2 Recommendation](https://www.w3.org/TR/WCAG22/) is normative. Its [conformance requirements](https://www.w3.org/TR/WCAG22/#conformance-reqs) apply to full pages and complete processes, not a cherry-picked set of criteria. Nothing in the cited criteria exempts loopback/local web content.
- [Understanding documents](https://www.w3.org/WAI/WCAG22/Understanding/) describe themselves as “Informative explanations, not required to meet WCAG”. Their explanations, examples, techniques, and failures inform interpretation but are not additional normative requirements.
- [Techniques](https://www.w3.org/WAI/WCAG22/Techniques/) state: “They are not required to meet WCAG.” A sufficient technique is one documented way to satisfy a criterion, not the only permitted implementation.
- The [ARIA Authoring Practices Guide introduction](https://www.w3.org/WAI/ARIA/apg/about/introduction/#apgisnotanormativestandard) says: “The APG does not specify normative requirements and thus does not have a conformance model.” Its keyboard models are conventions, not a separate WCAG conformance level.

## 1. Reflow — 1.4.10 (AA)

**Rule.** [SC 1.4.10](https://www.w3.org/TR/WCAG22/#reflow) requires presentation “without loss of information or functionality, and without requiring scrolling in two dimensions” for:

> “Vertical scrolling content at a width equivalent to 320 CSS pixels”
>
> “Horizontal scrolling content at a height equivalent to 256 CSS pixels.”
>
> “Except for parts of the content which require two-dimensional layout for usage or meaning.”

These are alternative tests for different reading/scrolling directions, **not** a requirement that a conventional vertically scrolling dashboard fit completely into a 320 × 256 box. The normative notes equate 320 CSS px to a 1280 CSS px viewport at 400% zoom, and 256 CSS px to a 1024 CSS px viewport height at 400% zoom for horizontally scrolling content. Browser chrome can make the available viewport smaller than the display resolution: [Understanding, viewport discrepancies](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html#acknowledging-viewport-vs-resolution-discrepancies).

**Two-dimensional exception.** The normative note expressly includes “maps and diagrams”, “data tables (not individual cells)”, and “interfaces where it is necessary to keep toolbars in view while manipulating content”. [Understanding, tabular data and grid-based UI](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html#tabular-data-and-grid-based-ui) explains:

> “Data tables and grids have a two-dimensional relationship between column and row headers and their data cells.”
>
> “However, individual cells would still need to meet Reflow”

The same document includes graphs under [graphics and fixed-dimension media](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html#graphics-video-and-other-fixed-dimension-media). A date × weekday contribution calendar and weekday × hour heatmap can fall within the grid exception when their two-dimensional relationship is needed for meaning. This is an application of the layout-based exception, not a blanket exception for anything called a calendar or heatmap. The exception does not spread to surrounding headings, search, pagination, filters, or ordinary text. A table's pinned name column is not automatically an exemption for text inside its cells.

**Toolbars and fixed headers.** The toolbar exception concerns necessary concurrent manipulation of content, illustrated by a photo editor; it does not say every navigation/range toolbar is excepted. [Understanding, overlap with focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html#focus-not-obscured-minimum) says sticky content can “make reading content difficult if not impossible” and suggests static positioning or user toggling at smaller viewports. [C34](https://www.w3.org/WAI/WCAG22/Techniques/css/C34), “Using media queries to un-fixing sticky headers / footers”, is explicitly **advisory**, not a universal prohibition on fixed headers.

**Application.** Sideways scrolling of necessary charts, tables, and two-dimensional grids can conform; the ordinary dashboard shell and surrounding text still have to reflow without losing access. A never-scrolling phone top/range bar remains subject to access and focus requirements at zoomed/small viewports. There is no WCAG-defined maximum header height in these sources.

## 2. Non-text contrast — 1.4.11 (AA), versus focus appearance — 2.4.13 (AAA)

**Rule.** [SC 1.4.11](https://www.w3.org/TR/WCAG22/#non-text-contrast) requires “at least 3:1 against adjacent color(s)” for visual information needed to identify controls/states, and:

> “Parts of graphics required to understand the content, except when a particular presentation of graphics is essential to the information being conveyed.”

**Background versus adjacent series.** [Understanding, graphical objects](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html#graphical-objects) describes a line-chart example:

> “The lines should have 3:1 contrast against their background, but as there is little overlap with other lines they do not need to contrast with each other or the graduated lines.”

By contrast, boundaries between pie slices needed to judge proportions must be discernible. [G209](https://www.w3.org/WAI/WCAG22/Techniques/general/G209) says:

> “If adjoining colors have less than 3:1 color contrast ratio difference add a border with at least a 3:1 color contrast with each color.”

**Application.** For stacked bars whose segment sizes convey values, meaningful segment boundaries are tested against adjacent segments or a separating border/gap; the meaningful outside contour is tested against its background. Separate lines/bars/cells are not required to contrast pairwise with all other series or levels merely because they share a chart. Needed gridlines are themselves graphical objects. These are contrast tests of necessary visible information, not requirements to make every decorative line visible.

**Text alternatives and dynamic readouts.** [Understanding, required for understanding](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html#required-for-understanding) explicitly exempts reliance on graphic contrast where:

> “A graphic with text embedded or overlaid conveys the same information, such as labels and values on a chart.”
>
> “The information is available in another form, such as in a table that follows the graph, which becomes visible when a ‘Long Description’ button is pressed.”

Labels **without values** do not necessarily convey equivalent proportional information: its labelled pie example fails; labels **and values** make slices not required for understanding. A chart's text remains subject to text contrast. For [interactive changes](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html#interactive-changes-in-contrast), the document says:

> “the unfocused default version must already have sufficiently contrasting colors or text.”

It permits information to become text dynamically on mouseover/tap/focus. Therefore a readout is not an automatic exemption for an initially indiscernible interactive chart, and must actually convey the needed equivalent information, not just the existence of a selected point. The graphical-object exemption also does not remove required control-state/focus contrast.

**Heatmaps and gradients.** [Understanding, essential exception](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html#essential-exception) includes “color gradients that represent a measurement, such as heat maps”, under examples that cannot be represented another way without undermining meaning. This does **not** declare every discrete multi-level heatmap palette essential; the document separately excludes insufficient contrast that is simply an author choice. [Testing principles](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html#testing-principles) say to test the least-contrasting area and, if below 3:1, ask whether the object remains understandable when that area is treated as invisible. There is no rule here requiring every pair of steps along an essential continuous gradient to reach 3:1.

**Focus.** [Understanding 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) requires a custom focus indicator to contrast with its adjacent colors in the focused state, with the unmodified user-agent appearance exception. It says this criterion “does not directly compare the focused and unfocused states”. [SC 2.4.13](https://www.w3.org/TR/WCAG22/#focus-appearance), **AAA**, adds an indicator area at least equivalent to a 2 CSS px thick perimeter and “at least 3:1 between the same pixels in the focused and unfocused states”. [Understanding 2.4.13](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html#relationship-with-non-text-contrast) confirms that 1.4.11 establishes no size requirement. [2.4.7 Focus Visible](https://www.w3.org/TR/WCAG22/#focus-visible) is AA; the AAA 2 px-area rule must not be described as an AA obligation.

## 3. Use of color — 1.4.1 (A)

**Rule.** [SC 1.4.1](https://www.w3.org/TR/WCAG22/#use-of-color):

> “Color is not used as the only visual means of conveying information, indicating an action, prompting a response, or distinguishing a visual element.”

[Understanding](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) expressly says “This criterion requires a visible alternative to color.” An accessible name available only to a screen reader does not by itself satisfy this visual requirement.

**Documented techniques.**

- [G111, color and pattern](https://www.w3.org/WAI/WCAG22/Techniques/general/G111): a bar-chart example gives each region “a different solid color and a different pattern”; “The legend uses the same colors and patterns to identify each bar.” Dashed/dotted lines, distinctive markers, and matched patterns are illustrated by its other examples.
- [G14, text](https://www.w3.org/WAI/WCAG22/Techniques/general/G14): conveys color-coded information “explicitly in text”. Its test checks that “the text is not conditional content”. Direct identifiers/labels or a visible equivalent textual presentation can convey series membership independently of a color-only key. A hover-only tooltip is not the unconditional text tested by this specific technique.
- [G182](https://www.w3.org/WAI/WCAG22/Techniques/general/G182) applies to **text** color differences and adds font style, underlines, bold, italics, or size. It is not a generic contrast exemption for chart series.
- [G183](https://www.w3.org/WAI/WCAG22/Techniques/general/G183) is specifically for **inline text links** distinguished from surrounding text by color/lightness. Its current text requires at least 3:1 link-to-surrounding-text contrast. It does not supply a chart-series keyboard or pattern model.

**Lightness distinction.** Understanding says a “difference in relative luminance between the colors” producing “3:1 or greater” counts as an additional visual distinction, but an additional indicator is still needed where users must accurately perceive a **particular color**.

**Application.** A multi-series chart and legend matched **only by hue**, without another visible way to determine which series is which, fails this criterion. A legend containing series names does not fix that if matching names to plotted marks still requires hue alone. Sufficient lightness distinctions are not hue alone; not every legend with colored swatches automatically fails.

## 4. Text spacing — 1.4.12 (AA)

**Rule.** [SC 1.4.12](https://www.w3.org/TR/WCAG22/#text-spacing) requires “no loss of content or functionality” when users change only these properties together: line height ≥ 1.5 × font size; paragraph spacing ≥ 2 × font size; letter spacing ≥ 0.12 × font size; word spacing ≥ 0.16 × font size. Authors need not use these defaults or provide their own spacing UI.

**Ellipsis.** [Understanding, use of ellipses](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html#use-of-ellipses):

> “the page can still meet the Text Spacing requirements, so long as the content is still available.”
>
> “Where text is not truncated but it is when text is spaced, if there is no mechanism to show the truncated text, it fails this success criterion.”

Examples include revealing text on focus/activation or showing it on the linked page. Ellipsis itself is not equivalent to preserving the missing content.

**Fixed boxes.** [F104](https://www.w3.org/WAI/WCAG22/Techniques/failures/F104) describes failures where text is in “a size-constrained block which does not expand if the size of the content increases”, including `overflow: hidden`, absolute positioning, and insufficient borders. It illustrates both clipping and overlap in fixed-height boxes.

**Application.** Fixed-height virtual rows, sidebar labels, header/range controls, and readout boxes are not categorically forbidden, but spacing overrides cannot cause inaccessible text or broken functionality. Newly truncated content can still conform if a working mechanism exposes all of it; unrecoverable clipping or overlap fails.

## 5. Resize text — 1.4.4 (AA)

**Rule.** [SC 1.4.4](https://www.w3.org/TR/WCAG22/#resize-text): except captions and images of text, text must resize “without assistive technology up to 200 percent without loss of content or functionality”.

[Understanding](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html) says:

> “Content satisfies the success criterion if it can be scaled up to 200% using at least one text scaling mechanism supported by user agents.”

It expressly lists full-page zoom and gives a browser-zoom example. [G142](https://www.w3.org/WAI/WCAG22/Techniques/general/G142), relying on commonly available user agents supporting zoom, is a sufficient technique.

**Application.** Effective browser zoom can satisfy 1.4.4; this criterion does not separately require that text follow the browser's default font-size preference. Resize must actually work for text-based controls/labels and intermediate zoom steps, without clipping/loss. Responsive breakpoints must not prevent reaching 200% enlargement. This answer does not remove the separate reflow and text-spacing obligations.

## 6. Character key shortcuts — 2.1.4 (A)

**Exact SC text.** [SC 2.1.4](https://www.w3.org/TR/WCAG22/#character-key-shortcuts):

> If a keyboard shortcut is implemented in content using only letter (including upper- and lower-case letters), punctuation, number, or symbol characters, then at least one of the following is true:
>
> **Turn off:** A mechanism is available to turn the shortcut off;
>
> **Remap:** A mechanism is available to remap the shortcut to include one or more non-printable keyboard keys (e.g., Ctrl, Alt);
>
> **Active only on focus:** The keyboard shortcut for a user interface component is only active when that component has focus.

**Shift, punctuation, digits, sequences.** [Understanding](https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html) says “it's not relevant whether a shortcut can be activated using a single physical key” and expressly includes `?` produced with `Shift+/`, accented characters produced with AltGr, and `G` then `A` sequences. [F99's test](https://www.w3.org/WAI/WCAG22/Techniques/failures/F99) says “Hold the Shift key and press the same keys again.” Uppercase characters do not escape the criterion because Shift generated them.

**Application.** `g` then `o`/`m`/`p`, `1`–`7`, `[`, `]`, `/`, `Shift+X`, `c`, `v`, and `?` all fall within the character-only rule as described. `Mod+K` uses a non-printable modifier and `Esc` is non-printable, so those are not character-only shortcuts. Merely suppressing global shortcuts in text inputs is not the “only active when that component has focus” exception for global page actions; the exception is component-scoped, as with listbox/select type-ahead.

**Mechanisms and examples.** [G217](https://www.w3.org/WAI/WCAG22/Techniques/general/G217) illustrates a toggle to disable email-client shortcuts and a menu remapping shortcuts/modifiers. Changing the printable key alone, or replacing a lowercase letter with its Shift-generated uppercase counterpart, does not meet the stated remap-to-non-printable requirement. A shared switch can turn off the relevant character shortcuts; the SC does not require one switch per key or require all three alternatives simultaneously.

**Persistence.** Neither SC 2.1.4, its Understanding document, nor G217 specifies a cross-reload/cross-session persistence requirement. A persistent preference is therefore not an explicit requirement of **this criterion**. The disabling/remapping mechanism still has to be available and work in the content being assessed. [F99](https://www.w3.org/WAI/WCAG22/Techniques/failures/F99) documents the failure where a search shortcut cannot be disabled or modified.

## 7. Pause, stop, hide — 2.2.2 (A)

**Rule, two separate bullets.** [SC 2.2.2](https://www.w3.org/TR/WCAG22/#pause-stop-hide): moving/blinking/scrolling information must start automatically, last **more than five seconds**, and be parallel to other content to trigger its control requirement. The auto-updating bullet instead says:

> “For any auto-updating information that (1) starts automatically and (2) is presented in parallel with other content, there is a mechanism for the user to pause, stop, or hide it or to control the frequency of the update unless the auto-updating is part of an activity where it is essential.”

[Understanding](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html) explains:

> “‘Auto-updating’ refers to content that updates or disappears based on a preset time interval.”
>
> “there is no five second exception for auto-updating”

**Application.** Automatically refreshed dashboard numbers alongside other content meet the auto-updating description even when values change in place without animation. A ticking “last write 12 s ago” string is likewise periodically changing visual information; it is not exempt because it is small, a timestamp, or unanimated. A value updated directly in response to an intentional user action is distinct from an automatically starting periodic refresh.

**Essential.** The [normative definition](https://www.w3.org/TR/WCAG22/#dfn-essential) is:

> “if removed, would fundamentally change the information or functionality of the content, and information and functionality cannot be achieved in another way that would conform”

Calling a feature “live” does not establish this definition. Understanding expressly discusses stock tickers, weather radar, traffic cameras, and auction timers being paused and restarted at the current live state, rather than falsely replaying old status. Its loading-animation exception is narrowly explained where interaction cannot occur for anyone and lack of progress would appear broken. There is no essential-statistics-dashboard exemption in these sources.

**What control must do.** One of pause, stop, hide, or user-controlled update frequency suffices for auto-updating; all four are not required. Merely polling less frequently without user control is not the stated frequency mechanism. The SC specifies no minimum allowable interval. Understanding says a pause must not “tie up the user or the focus so that the page cannot be used”; stopping only while hovered/focused does not meet that meaning of pause. [The pause definition](https://www.w3.org/TR/WCAG22/#dfn-pause) means stopped by user request and not resumed until requested. Intermediate updates need not be preserved for replay; resuming at current data is allowed. A single control for multiple updating elements is best practice; separate effective controls also satisfy the normative requirement.

**Techniques/failures.** [G186](https://www.w3.org/WAI/WCAG22/Techniques/general/G186) includes a teleconference queue that switches between automatic updates and a manual Refresh button, and a stock ticker Pause control. [G4](https://www.w3.org/WAI/WCAG22/Techniques/general/G4) documents pausing/restarting. The published failure links include [F16](https://www.w3.org/WAI/WCAG22/Techniques/failures/F16) for uncontrolled scrolling and [F50](https://www.w3.org/WAI/WCAG22/Techniques/failures/F50)/[F112](https://www.w3.org/WAI/WCAG22/Techniques/failures/F112) for uncontrolled blinking. For in-place **numbers**, W3C's explicitly **proposed**, non-normative [ACT rule efbfc7](https://www.w3.org/WAI/standards-guidelines/act/rules/efbfc7/proposed/) has a failed random-number example where there is “no instrument available to stop, pause, hide or alter the frequency of the automatic changes”, and passing examples for each of the four options. Its ten-minute observation window is explicitly a testing convenience, not a WCAG exemption.

## 8. Focus not obscured (minimum) — 2.4.11 (AA)

**Rule.** [SC 2.4.11](https://www.w3.org/TR/WCAG22/#focus-not-obscured-minimum):

> “When a user interface component receives keyboard focus, the component is not entirely hidden due to author-created content.”

This minimum allows **partial** obscuring; [2.4.12](https://www.w3.org/TR/WCAG22/#focus-not-obscured-enhanced), AAA, does not. It evaluates the component, not an external focus ring alone; a hidden ring can separately fail 2.4.7. [Understanding](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) identifies “sticky footers, sticky headers, and non-modal dialogs” as typical obscurers.

**User-opened sheet exception.** Normative Note 2 allows user-opened content to obscure focus if the user can reveal the focused component “without advancing the keyboard focus”. Understanding gives Escape-dismissal and scrolling examples. This is not an exception for an author-prepositioned sticky header or an automatically displayed warning. User-movable interfaces are tested at initial positions (Note 1), not every position the user can create.

**Technique/failure.** [C43](https://www.w3.org/WAI/WCAG22/Techniques/css/C43) is a sufficient `padding`/`scroll-padding` technique; [F110](https://www.w3.org/WAI/WCAG22/Techniques/failures/F110) documents sticky headers/footers completely hiding focused elements.

**Application.** The fixed top/range bars and pinned table column cannot completely cover a newly focused control. A user-opened non-modal filter sheet may use the note only if revealing the hidden focus does not require tabbing to its close button. Modal focus confinement and non-modal focus behaviour are distinct cases; these sources do not require every sheet to be modal.

## 9. Target size (minimum) — 2.5.8 (AA)

**Rule.** [SC 2.5.8](https://www.w3.org/TR/WCAG22/#target-size-minimum) requires a pointer target at least **24 × 24 CSS px**, unless one of five exceptions applies:

- **Spacing:** a 24 CSS px diameter circle centered on each undersized target's bounding box does not intersect another target or another undersized target's circle. This is a geometrical test, not a blanket “add a few pixels” rule.
- **Equivalent:** “The function can be achieved through a different control on the same page that meets this criterion”.
- **Inline:** target is in a sentence or constrained by the line-height of non-target text.
- **User agent control:** target size is determined by the user agent and not modified by the author.
- **Essential:** a particular target presentation is essential or legally required for the information conveyed.

The measured area is the **operable target**, not necessarily the visible mark. [Understanding](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) says the size test conceptually fits an axis-aligned solid 24 × 24 square within the target; zooming does not change CSS-pixel conformance.

**Dense charts/maps.** [Understanding, exceptions](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html#exceptions) explains essential map pins, then says:

> “A similar example is an interactive data visualization where targets are necessarily dense.”

This is conditional on size/spacing being fundamental to the information, not a categorical exemption for all data visualisations. Dense author-created calendar cells are not automatically user-agent controls; the native `<input type="date">` calendar is its user-agent example.

**One spatial-selection target.** Normative Note 1 says:

> “Targets that allow for values to be selected spatially based on position within the target are considered one target for the purpose of the success criterion.”

Its examples are sliders, gradient color pickers, and editable cursor-positioning areas. **Application:** if the whole chart is genuinely one surface whose tap position selects the nearest bucket/readout value, Note 1 can apply to that spatial-selection surface; each 3 px painted bar need not automatically be a separate target. If bars/cells are separate actionable targets, the rule applies to those targets unless an exception is established. A chart container cannot reclassify unrelated tiny buttons as one target merely by enclosing them.

**Small grid cells.** Individually interactive 16 px-column calendar cells or 12 px weekday/hour cells cannot meet ordinary size/spacing merely through those dimensions; closely spaced centers make the 24 px circles overlap. They may instead fall under an applicable equivalent/essential exception. Non-interactive painted cells are not pointer targets.

**Equivalent controls elsewhere.** The criterion explicitly permits a **different** control elsewhere on the **same page**. Previous/next reading buttons can be equivalent for inspecting every bucket if they actually achieve the same inspection function and meet the criterion; a control that only changes the overall date range is not equivalent to reading each value. Keyboard-only arrow support is not itself a conforming equivalent pointer target. No cited text requires the alternative control to look like the original chart mark.

## 10. Dragging and pointer cancellation — 2.5.7 (AA), 2.5.2 (A)

**Dragging rule.** [SC 2.5.7](https://www.w3.org/TR/WCAG22/#dragging-movements):

> “All functionality that uses a dragging movement for operation can be achieved by a single pointer without dragging”

Exceptions are essential dragging and unmodified user-agent functionality. [Understanding](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) gives a slider alternative: “click/tap anywhere on the slider track to move the thumb to that position”. It says keyboard equivalence “does not automatically meet this success criterion”, and a different component can provide equivalent single-pointer functionality. Native overflow scrolling is user-agent functionality; author-suppressed/reimplemented scrolling is not. [G219](https://www.w3.org/WAI/WCAG22/Techniques/general/G219) is sufficient; [F108](https://www.w3.org/WAI/WCAG22/Techniques/failures/F108) documents lack of a non-drag pointer method.

**Application.** A pressed-finger chart cursor that follows the pointer across buckets has the described dragging model. Tapping to inspect each bucket can provide the same reading outcome without dragging; keyboard arrow support alone cannot supply the required pointer alternative. The cited Understanding document has slider/carousel/map examples, not a specific chart-scrubbing prescription. If reading only changes on unpressed hover, that is not itself a dragging movement.

**Swipe versus drag.** [2.5.1 Pointer Gestures](https://www.w3.org/TR/WCAG22/#pointer-gestures), A, additionally governs path-based gestures. Its [Understanding](https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures.html) expressly includes swiping/flicking where direction/path matters. A sheet tracking the finger can involve dragging; a directional swipe-to-dismiss can involve a path-based gesture; some implementations involve both. A simple pointer-operable dismissal can supply the equivalent outcome. Browser-provided scrolling gestures are different from an author-created dismiss gesture.

**Cancellation rule.** [SC 2.5.2](https://www.w3.org/TR/WCAG22/#pointer-cancellation) requires at least one of:

- **No down-event:** “The down-event of the pointer is not used to execute any part of the function”;
- **Abort or undo:** completion on up-event, with a mechanism to abort before completion or undo afterwards;
- **Up reversal:** up-event reverses the preceding down-event outcome;
- **Essential:** down-event completion is essential (keyboard/numeric keypad emulation is expressly considered essential).

[Understanding](https://www.w3.org/WAI/WCAG22/Understanding/pointer-cancellation.html) permits reversible press-and-hold popups and drag/drop with abort/undo. Generic `click` activates on release. [G210](https://www.w3.org/WAI/WCAG22/Techniques/general/G210) covers cancelling drag/drop, [G212](https://www.w3.org/WAI/WCAG22/Techniques/general/G212) native up-event controls, and [F101](https://www.w3.org/WAI/WCAG22/Techniques/failures/F101) inappropriate down-event activation.

**Application.** Temporary chart readouts during a press are not categorically forbidden: they can follow a cancellation model such as up reversal, or a preview followed by cancellable/undoable completion on release. Persistently filtering/navigating or dismissing a sheet on initial pointer-down is not justified merely because it is responsive. Actual cancellation behaviour, not whether an action is called a “tap”, determines which bullet applies.

## 11. Status messages — 4.1.3 (AA)

**Rule.** [SC 4.1.3](https://www.w3.org/TR/WCAG22/#status-messages) requires status messages to be programmatically determinable through role/properties so assistive technology can present them “without receiving focus”. [Understanding](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) defines the scope as information about “the success or results of an action”, waiting state, process progress, or errors, **not** delivered via a change of context.

**Included versus excluded.** It expressly says:

> “the list of results obtained from a search are not considered a status update”
>
> “‘Searching...’, ‘18 results returned’ or ‘No results returned’ would be status updates if they do not take focus or cause a page refresh.”

Changes to existing status text count too: its shopping-cart example changes “0 items” to “3 items”. Status communicated by an icon also needs appropriate text alternative and status semantics. Opening an accordion, changing tabs, or adding survey questions is not automatically a status message; state/value changes have separate 4.1.2 obligations.

**Application.** A displayed result count after filtering and a “Copied” confirmation communicate results/success and fit this definition if they do not take focus. A “not updating” banner can fit when conveying a waiting/error/progress-related application state. Ordinary changed data rows/chart values after filtering are not all automatically status messages; a summary count/confirmation can be. Numbers already functioning as status text are different from ordinary statistical data.

**No whole-page announcement mandate.** Understanding says:

> “The purpose of this success criterion is not to force authors to generate new status messages.”

It also warns of making an application “too ‘chatty’”. This criterion does not require announcing an entire new page state, every row, or every refreshed number after a filter change. It requires displayed **status messages** to have usable programmatic semantics. [ARIA22](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA22) documents `role="status"`, implicit polite live behaviour, and atomic context; [ARIA19](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA19) documents alert/live regions for errors, not a universal requirement for assertive announcements.

## 12. Focus order and predictable changes in single-page apps

**Focus order — 2.4.3 (A).** [SC 2.4.3](https://www.w3.org/TR/WCAG22/#focus-order) requires focusable components to receive focus “in an order that preserves meaning and operability”. [Understanding](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html) says:

> “This requirement does not specify what should or should not receive focus, but rather assesses the order in which elements receive focus.”

It permits programmatic focus on static text/headings and gives modal/non-modal dialog examples. [SCR26](https://www.w3.org/WAI/WCAG22/Techniques/client-side-script/SCR26) documents dynamic content after its trigger with focus remaining on that trigger. Therefore 2.4.3 is not an unconditional instruction to move focus after every content update.

**Explicit APG SPA navigation examples.** [Navigation Menubar](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/examples/menubar-navigation/) moves focus to the new content's level-one heading: “Focusing on the heading informs screen reader users that navigation is complete and confirms the destination.” [Navigation Treeview](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/examples/treeview-navigation/) describes both moving focus into new content and keeping it on the activated tree item while updating `aria-current`; it calls moving focus optional. These are informative examples, not mandates that the dashboard use menubar/treeview roles. [APG keyboard guidance](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/#discernibleandpredictablekeyboardfocus) also addresses restoring logical visible focus when the active element is hidden or removed.

**Predictability — 3.2.x.**

- [3.2.1 On Focus](https://www.w3.org/TR/WCAG22/#on-focus), A: receiving focus “does not initiate a change of context”. Activation of a link/button is different from merely focusing it.
- [3.2.2 On Input](https://www.w3.org/TR/WCAG22/#on-input), A: changing a control's setting does not automatically change context unless the user was advised beforehand. Its [Understanding](https://www.w3.org/WAI/WCAG22/Understanding/on-input.html) distinguishes checkbox/select changes from link/button activation and illustrates displaying different form fields without changing basic context.
- [3.2.3 Consistent Navigation](https://www.w3.org/TR/WCAG22/#consistent-navigation), AA: repeated navigation across a set of pages has the same relative order unless the user initiates the change.
- [3.2.4 Consistent Identification](https://www.w3.org/TR/WCAG22/#consistent-identification), AA: same-function components within a set of pages are consistently identified.
- [3.2.5 Change on Request](https://www.w3.org/TR/WCAG22/#change-on-request), **AAA**: context changes only on user request, or a mechanism turns them off. This broader automatic-context-change prohibition must not be labelled AA.
- [3.2.6 Consistent Help](https://www.w3.org/TR/WCAG22/#consistent-help), A: specified help mechanisms repeated across pages keep their order relative to other content; it does not require creating help that does not exist.

**What is a context change?** The [normative definition](https://www.w3.org/TR/WCAG22/#dfn-change-of-context) includes changes of user agent, viewport, focus, or content changing the meaning of the page. Its note: “A change of content is not always a change of context.” Its example includes “anything that would look to a user as if they had moved to a new page”. The [web-page definition](https://www.w3.org/TR/WCAG22/#dfn-web-page-s) explicitly includes an AJAX mail program with inbox/contacts/calendar behind one URI; “six pages” in product language does not alone determine whether criteria scoped to a **set of web pages** apply as six separate WCAG pages.

**Application.** User-activated navigation between the dashboard's views may legitimately change context; mere focus or unwarned filter-setting changes cannot do so under 3.2.1/3.2.2. Updating numbers/content in place without moving focus or materially changing overall context is not automatically a 3.2 violation. Automatically updating information remains governed by 2.2.2 even when it is not a context change. Focus order must remain meaningful through navigation, sheet closure, and virtual-row removal; WCAG does not prescribe one universal post-navigation focus destination.

## 13. Levels, current Recommendation, WCAG 3, and revisions

**Levels of the criteria discussed above**, verified against the [Recommendation](https://www.w3.org/TR/WCAG22/):

| Level | Criteria                                                                        |
| ----- | ------------------------------------------------------------------------------- |
| A     | 1.4.1; 2.1.4; 2.2.2; 2.4.3; 2.5.1; 2.5.2; 3.2.1; 3.2.2; 3.2.6                   |
| AA    | 1.4.4; 1.4.10; 1.4.11; 1.4.12; 2.4.7; 2.4.11; 2.5.7; 2.5.8; 3.2.3; 3.2.4; 4.1.3 |
| AAA   | 2.4.12; 2.4.13; 3.2.5                                                           |

AA conformance includes A **and** AA, not only the AA-labelled rows. This table is not a complete WCAG checklist. APG patterns have no A/AA level.

**Current as of this research date.** The [latest WCAG 2.2 URL](https://www.w3.org/TR/WCAG22/) identifies itself as “W3C Recommendation 12 December 2024”, with [this dated version](https://www.w3.org/TR/2024/REC-WCAG22-20241212/). It remains the latest recommended WCAG version checked on 3 October 2026. The abstract says W3C “advises the use of WCAG 2.2 to maximize future applicability of accessibility efforts”; publication does not deprecate/supersede the still-existing 2.0/2.1 Recommendations. [What's New](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/) dates initial publication to **5 October 2023**.

**WCAG 3 is not yet a Recommendation.** Its [latest publication](https://www.w3.org/TR/wcag-3.0/) is “W3C Working Draft 10 September 2026”, with [dated draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/). Status says: “Publication as a Working Draft does not imply endorsement by W3C and its Members.” It says the draft still has several years of work; it is not a replacement conformance standard for this research.

**Changes since 2023.** The [2.2 change log](https://www.w3.org/TR/WCAG22/#changelog) says “2024-12-12: Republished WCAG 2.2, incorporating the following errata”. It lists definition changes (single pointer, used in an unusual/restricted way, motion animation, programmatically determined); formatting changes to several definitions; removal of the defunct **encloses definition**; input-purpose typo correction; Target Size/Accessible Authentication formatting; presentation of “New”; device wording; and consistent terminology. These are distinct from removing SC 4.1.1.

The [current errata page](https://www.w3.org/WAI/WCAG22/errata/), last modified 1 October 2026 in the fetched response, lists editorial errata after that republication, including 2025–2026 definition/style/grammar/link corrections and clarified phrasing of 1.4.13. It labels the listed entries **Editorial Errata**. It also states substantive corrections “are not to be considered normative until a new Recommendation is published”. Evolving Understanding/Technique text must not be mistaken for a newly published normative SC.

**4.1.1.** [The Recommendation](https://www.w3.org/TR/WCAG22/#parsing) labels it “Parsing (Obsolete and removed)”. [What's New](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/#changes-from-wcag-21-to-wcag-22) confirms it was removed in **2.2**, not newly removed in the 2024 republication. This does not remove 1.3.1 or 4.1.2 obligations for programmatic structure and names/roles/values.

## 14. APG: charts, grids, listboxes, treegrids, and sliders

**No dedicated chart model found.** The current published [pattern catalog](https://www.w3.org/WAI/ARIA/apg/patterns/) and [example index](https://www.w3.org/WAI/ARIA/apg/example-index/) inspected for this research do not contain a dedicated chart/data-visualisation pattern or a keyboard-navigable chart example. This is a finding about these published catalogs, not a claim that no W3C work or issue ever discusses charts. [APG introduction](https://www.w3.org/WAI/ARIA/apg/about/introduction/#exercisecautionifdeviatingfromapgpatterns) says its pattern library “is not intended to serve as a catalog of all possible, valid, and potentially usable ways of building accessible user interfaces”.

**General keyboard model.** [Developing a Keyboard Interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/) says Tab/Shift+Tab move between components and arrow keys generally move **inside** composites. It documents roving `tabindex` and `aria-activedescendant`; the latter requires a supporting role and the specified DOM ownership/control relationship, not an arbitrary focusable graphic. Focus and selection are distinct.

**Grid.** [Grid Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/) calls grid “a generic container widget that offers flexible keyboard navigation” and says its visual presentation need not be tabular. It “Always contains multiple focusable elements”; “Only one” is in the page's tab sequence, and authors implement focus management.

- **Data grid:** tabular data; each data cell is focusable or contains a focusable element. Arrow keys move one cell in each dimension and stop at edges; Home/End reach row endpoints; Ctrl+Home/End reach grid endpoints; Page Up/Down move author-determined row counts. Non-functional row/column headers need not be focusable.
- **Layout grid:** groups widgets; may have one row/column or a homogeneous set wrapping responsively. Edge wrapping is optional here; APG says it “would be disorienting if used in a data grid”. Page Up/Down and Ctrl+Home/End have optional variants.
- A cell can contain text or a graphic, or a directly focused widget. Enter/F2 can enter cell editing/widget interaction; Escape restores grid navigation, optionally undoing edits. Enter activating an actual button/link inside a cell uses that control's normal action. The pattern does **not** define Escape globally as “clear chart reading cursor”.
- Roles/structure are `grid` → `row` → `gridcell`/`rowheader`/`columnheader`, with name/description. For non-DOM/hidden rows or columns it documents `aria-rowcount`/`aria-colcount` and indices. Its virtual-loading note warns that Ctrl+End can otherwise reach only the last DOM row rather than the last back-end row.

**Listbox.** [Listbox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/) is a list of **selectable options**, with up/down navigation, horizontal variants, Home/End and type-ahead guidance, and selection distinct from focus. It says:

> “it does not provide an accessible way to present a list of interactive elements, such as links, buttons, or checkboxes.”

Option names are flattened strings, not nested semantic content. It can describe a bucket selection **if that is genuinely an options-selection interaction**; it does not provide a generic inspect-only chart role or nested actionable points. Its published pattern does not prescribe Enter-to-act/Escape-to-clear chart behaviour.

**Treegrid.** [Treegrid Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/treegrid/) is “a hierarchical data grid”; child rows expand/collapse. Left/right have hierarchy functions in row-focused cases; Enter toggles an expandable first cell or performs the cell's default action. A flat time-series reading cursor does not gain the required hierarchy merely by supporting arrow keys and Enter.

**Slider.** [Slider Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/slider/) is “an input where the user selects a value from within a given range”. Right/up increase, left/down decrease, Home/End reach limits, optional Page Up/Down use larger steps. It requires slider name and current/min/max values; `aria-valuetext` can communicate meaningful dates/labels instead of a bare index. Enter acting and Escape clearing are not part of its listed slider model. Its warning says touch assistive technologies may have difficulty producing the necessary key events and calls for testing those devices. A range-selection cursor and a multi-item chart are different semantic models; matching a few arrow keys does not establish role fitness.

**Application.** APG supplies nearby models with distinct semantics, not one mandated role for “focusable chart; arrows read; Enter acts; Escape clears”. The claimed role must describe the actual interaction and satisfy its structure/value/state model. The sources support keyboard navigation conventions and alternatives, but do not certify the proposed chart contract simply because it resembles a grid, listbox, treegrid, or slider.

## 15. GitHub contribution calendar: inspected markup and first-party behaviour docs

**Method and boundaries.** On 3 October 2026, fetched the public logged-out [torvalds profile](https://github.com/torvalds). Its initial HTML defers contributions using an `include-fragment` with `src="/torvalds?action=show&controller=profiles&tab=contributions&user_id=torvalds"`. Fetched [that fragment URL](https://github.com/torvalds?action=show&controller=profiles&tab=contributions&user_id=torvalds) using `X-Requested-With: XMLHttpRequest`; an ordinary request returned the full profile shell. Also fetched the fragment-declared [calendar endpoint](https://github.com/users/torvalds/contributions), which yielded the same relevant grid structure. This is inspection of server HTML, **not** a browser accessibility-tree or assistive-technology runtime test.

**Current observed structure.** An `overflow-x: auto; overflow-y: hidden` container contains an actual HTML `table`, with:

```html
<table role="grid" aria-readonly="true" class="ContributionCalendar-grid js-calendar-graph-table">
  <caption class="sr-only">
    Contribution Graph
  </caption>
</table>
```

The fragment includes `<thead>`, `<tbody>`, and `<tr>` structure. Month labels use full-name `sr-only` spans and abbreviated `aria-hidden="true"` visible spans. The first column similarly supplies full weekday names. In this fetched response these labels use `<td>` elements, not `<th>` header cells. The calendar had 53 week columns in the sampled data, seven weekday rows, plus the label column/header row; the 2023 documentation's “54 columns, 8 rows” is a historical sample announcement, not a fixed count promised for every calendar.

**Observed cell and tooltip example**, omitting no attributes from this sampled day cell:

```html
<td
  tabindex="0"
  data-ix="0"
  aria-selected="false"
  aria-describedby="contribution-graph-legend-level-1"
  style="width: 10px"
  data-date="2025-09-28"
  id="contribution-day-component-0-0"
  data-level="1"
  role="gridcell"
  data-view-component="true"
  class="ContributionCalendar-day"
></td>
```

The adjacent custom `tool-tip` has `for="contribution-day-component-0-0"`, `popover="manual"`, `data-direction="n"`, `data-type="label"`, `class="sr-only position-absolute"`, and the text **“9 contributions on September 28th.”** The cell's `aria-describedby` references a legend element whose `sr-only` text is **“Low contributions.”** Other legend levels read “No contributions.”, “Medium-low contributions.”, “Medium-high contributions.”, and “High contributions.” The sampled row has 10 px height and day cells have 10 px width; this is observed styling, not evidence of WCAG target-size conformance.

Multiple day cells are emitted with `tabindex="0"` in the **server response**. No `aria-activedescendant` or per-day `aria-label` is present in the sampled table markup; label linkage is represented by the custom tooltip and `data-type="label"`. The `js-calendar-graph`/`js-calendar-graph-table` classes, `data-ix`, date data, selection state, and `data-graph-url` are script-hook hints. The fetched table itself has no inline key-handler attributes. These observations do not establish the post-initialisation roving-tabindex setup, computed accessible name, or actual keyboard behaviour; JavaScript/custom-element processing can alter the DOM/accessibility tree.

**GitHub's first-party description.** Its [2 March 2023 changelog](https://github.blog/changelog/2023-03-02-accessibility-improvements-for-the-contribution-graph/) says:

> “The contribution graph now supports keyboard interaction and compatibility with assistive technologies.”
>
> “While navigating the graph, a summary of each day is displayed visually in a tooltip and announced by screen readers.”

It documents arrow keys cell-by-cell; Page Up/Down first/last cell in a column; Home/End first/last cell in a row; and Enter filtering the Contribution Activity section by the current cell. It quotes the then-example initial announcement:

> “Contribution Graph, table, 54 columns, 8 rows.”
>
> “User activity over 1 year of time. Each column is one week, with older weeks to the left. Select a cell to filter the ‘Contribution Activity’ section.”

The changelog's example day announcement includes count, weekday, and full date. The currently fetched server tooltip instead has count and month/day; these are different evidence types/dates, not grounds to claim a screen reader currently speaks the server tooltip verbatim. The sampled HTML uses **grid** role even though the changelog describes an announcement as **table**. Both findings are recorded without treating the old prose as today's role attribute or claiming current browser/AT verification.

**Application.** GitHub demonstrably provides calendar tabular/grid markup, per-day text, intensity descriptions, and a documented keyboard interaction rather than a color-only inaccessible picture. It is a first-party implementation reference, not proof that copying its dimensions, emitted tabindex values, or exact key bindings would conform in the dashboard.
