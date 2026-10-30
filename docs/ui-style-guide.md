# OMXTerm UI style guide

Internal DOM primitives in `src/renderer/application-page.ts` and
`application-page.css`, used by the retained Settings application tab. These are
not an extension runtime, public SDK or new theme schema. Terminal canvas
geometry and native OS dialogs remain separate.

## Reusing an application page

`createApplicationPage(document, { title, actions, navigation, notice, content,
status })` composes existing nodes into an in-flow header and bounded workspace.
Only `title` and `content` are required. Navigation and content scroll
independently; notices and status have bounded overflow. The content slot is the
single size-query container. Callers own navigation semantics, lifecycle,
localization, focus and actions; the shell never recreates supplied controls.
Import `application-page.css` along with the shared UI tokens.

Use `createPageButton(document, "primary" | "quiet" | "text")`, then attach the
localized label and action. It always creates a non-submit button; primary
styling is explicit, never dependent on sibling order. Apply `page-control` to
native fields and keep their native labels, validation and keyboard behavior.
Use `setPageNotice(element, { text, severity })` for retained feedback, with
`info`, `success`, `warning` or `error`. The caller supplies `role="status"` for
operation feedback or `role="alert"` for blocking file problems. Empty feedback
is hidden; updates do not take focus. Errors/warnings combine an exclamation
marker, bounded tinted container and semantic accent with actionable text;
color alone does not convey the problem. Keep user data literal, not HTML.

## Palette and hierarchy

`src/renderer/ui-tokens.css` supplies opaque `--ui-surface`/`--ui-text` from the
validated Terminal Theme. Neutral chrome (`#808090`) mixes into the surface at
12% for raised areas, 25% for hover and 35% for selection. Foreground mixes at
18% for decorative hairlines, 55% for identifiable input boundaries and 75% for
secondary text. Decoration is not focus: keyboard focus uses a 2 px foreground
outline, independent of nullable pane appearance. No card/border around every
shortcut row or category; spacing and subdued rules organize content.

Settings leaves its page layers transparent: the window body owns the base
Terminal Theme tint once. Navigation and catalog-card fills use alpha-scaled
raised tint; fields, selection and focus keep their readable foreground treatment.
About and Command Palette use `--ui-overlay` at the effective window background
opacity, with shared spacing, quiet controls and low-contrast outer hairlines.
Their backdrop is clear, not an independently forced dark scrim. Overlay tint can
accumulate over underlying application paint; neither CSS alpha nor page captures
prove desktop blur. Main retains native effect ownership. No whole-element
opacity fades text or focus. The native-control
`color-scheme` follows background sRGB luminance (light above 0.179), not OS
appearance. Arbitrary low-contrast custom palettes remain the user's choice;
these conventions do not establish universal accessibility or compositor parity.

## Typography, spacing and controls

- System UI, 14 px / 1.5 body; 12 px metadata; 22 px heading (18 px compact).
- Monospace only for effective shortcut bindings and the 13 px JSON editor.
- Spacing vocabulary: 4, 8, 12, 16, 24 and 32 px; 6 px control radius.
- Ordinary controls have a 36 px minimum height. Checkboxes stay native.
- **Primary:** explicit JSON Save, foreground fill/background text.
- **Quiet:** Record/Cancel, Close and ordinary actions, raised fill.
- **Text:** Unbind/Default, always visible with hover and keyboard focus.
- Default/Custom/Unbound is visible text, not color alone. Disabled operations
  remain recognizable and retain their action-specific accessible names.

## Settings layout

The full-area workspace caps at 1440 px. Sidebar width is 168 px below 900 px
and 192 px above; outer padding is 24 px, growing to 32 px at 1200 px.
The title and Close share a ruled in-flow header, within the same content cap.
These outer breakpoints use viewport media queries; `.application-page-content`
(the Settings panels slot) is the only size-query container. The content edge stays consistent across categories.
Ordinary forms cap at 720 px; Shortcuts and Config File at 1120 px. Content and
navigation scroll independently, with wrapped translated labels and diagnostics.

Container width, not viewport width, controls density: below 560 px labels sit
above their fields; number inputs cap at 112 px and other fields at 384 px.
Shortcut rows have action name, binding plus state, and visible actions; below
760 px the actions wrap onto their own line. This changes layout without
replacing controls or recording focus. Rows have 16/20 px vertical padding,
12 px internal row gaps and 8 px between actions; the recording button gains an
explicit border while its binding displays the recording prompt. Ordinary form
rows are separated by 24 px.

File problems and operation results use the same notice presentation. Raw saves
retain error severity for rejected writes and saved-but-not-applied outcomes;
returned warnings and newer unsaved edits remain warnings. Symlink notices give
only external-target editing/reload guidance; they never imply that Config File
can write through the link. Main-process validation and write policy are unchanged.

640×480 is the comfortable starting verification target, not a native minimum.
Below 640 px, categories become a wrapping three-column navigation area; short
windows allow additional vertical scrolling. No native bound/minimum changes
are tied to Settings selection. Large JSON content scrolls within its editor.

## Verification

Headless host/Settings tests establish ownership, retained identity and palette
selection, not visual quality. The real `window-chrome` **settings-only** fixture
covers six categories after a native-minimum window-size request, then at five
exact renderer viewports: 640×480, 800×600, 960×640, 1280×800 and 1920×1080.
Both Interface Languages and representative light/dark palettes retain 144
matrix cases plus four exact panel-container edges (559/560/759/760 px at viewport
height 640). Opening Settings separately preserves native outer bounds and
minimum before deliberate configuration edits.

The native-minimum slot records requested minimum and actual outer/content/
viewport sizes, not a claimed exact 320×200 renderer viewport. It requires a
compact viewport at most 639 px wide / 360 px high, smaller on both axes than
the original desktop viewport, and stable across the same category checks.
The runtime minimum is never lowered; no rounding tolerance or native clamp
cause is inferred. The fixture finally requests the original outer bounds once,
without claiming independent physical restoration proof. It checks the clicked category
against selected/hidden/computed-display state, form and shortcut placement on
each side of the content breakpoints, and label width/line geometry (not only
last-control reachability). Optional synthetic-only captures use
`OMXTERM_SETTINGS_EVIDENCE_DIR`. Failures capture a bounded frame and geometry
before restoring the renderer and requesting the saved outer bounds; the normal
runner retains them outside its removed profile under `.scratch/native-fixtures/`. Its programmatic focus/input
is not physical keyboard/layout qualification. Record actual execution and
limitations separately;
a built fixture is not a rendered pass.
