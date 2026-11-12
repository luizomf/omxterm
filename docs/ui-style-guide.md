# OMXTerm design system

Every DOM surface OMXTerm draws uses this system: window chrome, tabs, Settings,
the auxiliary panel, overlays, notices and the official extensions in
`extensions/`. The terminal canvas and native OS dialogs style themselves.
Third-party extensions may follow it but aren't required to.

The whole system is one stylesheet, [`src/renderer/ui.css`](../src/renderer/ui.css):
tokens plus a few component classes. The core renderer imports it first;
official extensions get it through `extensions/shared/appearance.css` (panel
and dialog views) or by importing it directly (full-page views). esbuild inlines it into
each bundle, so packages stay self-contained.

## Rules

- **The terminal comes first.** Chrome is quiet: thin rules, soft fills, no
  shadows, no decoration that competes with terminal output.
- **Use a component, not a local style.** Surface CSS holds layout only (grid,
  gaps, widths, positions). Colors, fonts, radii, borders and hover or
  selection fills come from `ui.css`. If two surfaces need the same new thing,
  add it to `ui.css` and to this page.
- **Use tokens, never literals.** No hex colors, font stacks or off-scale sizes
  in surface CSS.
- **Few words, few buttons.** One short sentence of guidance per page. One
  primary action per view at most.

## Tokens

All tokens derive from the active Terminal Theme, so light and dark themes need
no separate rules.

| Token                                                         | Value                                     | Use                                     |
| ------------------------------------------------------------- | ----------------------------------------- | --------------------------------------- |
| `--ui-surface`, `--ui-text`                                   | theme background and foreground           | page background and text                |
| `--ui-raised`, `--ui-hover`, `--ui-selected`                  | neutral mixed into the surface 12/25/35 % | opaque fills                            |
| `--ui-raised-tint`, `--ui-hover-tint`                         | the same, faded by window transparency    | fills on overlays and cards             |
| `--ui-control`, `--ui-control-hover`, `--ui-control-selected` | set by context (below)                    | what components read for their fills    |
| `--ui-decoration`                                             | text at 18 %                              | hairlines                               |
| `--ui-input-border`                                           | text at 55 %                              | field borders, scrollbars               |
| `--ui-secondary`                                              | text at 75 %                              | secondary text                          |
| `--ui-overlay`                                                | surface at window opacity                 | overlay surface                         |
| `--ui-font`, `--ui-font-mono`                                 | `system-ui`, `ui-monospace`               | all chrome; mono only for keys and code |
| `--ui-text-meta/chrome/body/title`                            | 12 / 13 / 14 / 18 px                      | metadata, chrome, body, page titles     |
| `--ui-space-1…8`                                              | 4, 8, 12, 16, 24, 32 px                   | the only spacing values                 |
| `--ui-radius`, `--ui-radius-overlay`, `--ui-radius-chip`      | 6 / 8 / 4 px                              | controls, overlays, chips and swatches  |

**Contexts** swap the control fills so the same component reads right
anywhere:

- default (pages, Settings): opaque `--ui-raised` / `--ui-hover` / `--ui-selected`;
- `.ui-on-tint` (the auxiliary panel and the extension views it hosts, and
  views hosted in a dialog): neutral alpha layers that stack over the panel or
  dialog and fade with transparency;
- `.ui-overlay`, `.ui-dialog`: the `-tint` fills;
- `.ui-card`: one step up, so a quiet button still reads on a card.

Focus is a 2 px `--ui-text` outline, never a fill or border. Native controls
take `color-scheme` from background luminance (light above 0.179).

## Components

| Class                               | Use it for                                                                                                                                                                                                                                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page-button` + `-primary`          | The one main action of a view (Save, Connect). Foreground fill.                                                                                                                                                                                                                                       |
| `page-button` + `-quiet`            | Ordinary actions. Control fill, no border.                                                                                                                                                                                                                                                            |
| `page-button` + `-text`             | Secondary actions in dense lists and navigation. No fill until hover.                                                                                                                                                                                                                                 |
| `page-button-compact`               | Add to any button in a dense row: 28 px tall, 13 px text.                                                                                                                                                                                                                                             |
| `ui-icon-button`                    | A 28 px square glyph or icon button (close, hide, toolbars). Always give it an accessible name and a tooltip.                                                                                                                                                                                         |
| `ui-link`                           | A text link, such as "Learn more" or About's links.                                                                                                                                                                                                                                                   |
| `page-control`                      | Native text fields, selects and textareas. 36 px, control fill, input border. Checkboxes stay native.                                                                                                                                                                                                 |
| `ui-actions` (`ui-actions-dense`)   | A group of buttons: wraps with an 8 px (4 px) gap. Buttons never touch.                                                                                                                                                                                                                               |
| `ui-list` + `ui-row`                | Lists people pick from (snippets, aliases, files, palette results). Hover and selection are fills, never borders or bars.                                                                                                                                                                             |
| `ui-nav`                            | Navigation (Settings categories, the panel's tool switcher). Only the selected item gets a fill and 600 weight.                                                                                                                                                                                       |
| `ui-tab`                            | Window tabs. Neutral alpha fills (10 %, 25 % hover, 40 % selected) with an underline that survives full transparency.                                                                                                                                                                                 |
| `ui-panel-header`                   | The header of a side panel: a truncating title, then icon buttons.                                                                                                                                                                                                                                    |
| `ui-card`                           | A raised block that groups one item (a catalog entry, a saved snapshot).                                                                                                                                                                                                                              |
| `ui-chip`                           | A key binding or short literal value.                                                                                                                                                                                                                                                                 |
| `ui-dialog`                         | Modal overlays (About, Command Palette, previews, extension setup). Clear backdrop; the rest of the window softens.                                                                                                                                                                                   |
| `ui-overlay`                        | Non-modal floating notices (the exit notice, the panel status, drop hints, state notices).                                                                                                                                                                                                            |
| `ui-mark` via `createStateMarks()`  | An ongoing state on a pane and its tab: one secondary glyph (12 px on a tab, about the terminal font size on a pane) with a tooltip and accessible name, no text on screen. With an action, the pane's glyph is a 24 px `ui-icon-button` with a pointer cursor, hover background and a quick tooltip. |
| `ui-popover`                        | Menus and tooltips over content in the same view. Solid surface.                                                                                                                                                                                                                                      |
| `page-notice` via `setPageNotice()` | Info, success, warning or error. Tinted block with a colored start edge; non-info severities add a glyph.                                                                                                                                                                                             |
| `ui-hint`                           | The one sentence of guidance on a page. Secondary color, about 72 characters wide.                                                                                                                                                                                                                    |
| `ui-meta`                           | Small secondary text: counts, kinds, states.                                                                                                                                                                                                                                                          |
| `ui-visually-hidden`                | A heading or label that only assistive technology needs.                                                                                                                                                                                                                                              |

Build pages with `createApplicationPage(document, { title, actions,
navigation, notice, content, status })` and buttons with
`createPageButton(document, variant)` from `src/renderer/application-page.ts`.
Full-page surfaces (Settings, full-page extension views) also import
`src/renderer/application-page.css` for the page grid. Panel and dialog views
use the compact page from `extensions/shared/appearance.css` and add
`class="ui-on-tint"` to their `<html>`.

## Surfaces

**Window chrome and tabs.** Tabs are `ui-tab` buttons in a 12 px strip. The
Linux/Windows title bar (`window-chrome.css`) uses 13 px text. Pane dividers
are 1 px hairlines; the focused pane in a split gets a 1 px accent line on top.
Default terminal padding is 12 px.

**Settings.** An 18 px title and Close above a hairline. A flat `ui-nav`.
Every category shares a 720 px content boundary; the sidebar is 168 px below
900 px viewport width and 192 px above; outer padding is 24 px, 32 px from
1200 px. Form rows have 12 px vertical padding and a hairline; labels sit left,
fields end at the content edge (fields at most 384 px, numbers 112 px); below
560 px of content width labels sit above fields. Shortcut rows are at least
48 px with the binding as a `ui-chip` and compact actions; only Custom and
Unbound are labelled. Settings is comfortable at 640×480; below 480 px
categories become a two-column grid.

**Auxiliary panel.** 13 px text on a 15 % neutral layer, separated from the
terminal by a hairline. The header holds the tool name, or a single-line
`ui-nav` switcher when several tools are open. Hide is a chevron toward the
panel's edge; Close (×) ends the tool. Extension views span the panel width so
their 12 px padding lines up with the panel title.

**Overlays.** One recipe: `--ui-overlay` surface, 1 px hairline, 8 px radius, no
shadow, quiet buttons. While a `ui-dialog` is modal a fixed 12 px CSS filter
softens the other body children; it's independent of the native `window.blur`
preference. The startup configuration banner is the one exception: a
full-width red strip, because OMXTerm fell back to defaults.

**State marks.** One system for state, from `src/renderer/state-marks.ts`
([ADR 0050](adr/0050-show-ongoing-states-as-quiet-state-marks.md)); never add
a strip, badge or color of your own. Pick the quietest tier that works:

- idle or success: nothing;
- something ongoing (mirroring, later an SSH session or an attached agent): a
  `ui-mark` glyph at the pane's top-right, inset by the terminal padding and
  centered on the first text row (it may cover the last column or two of row
  1), repeated once before the
  title on its tab when the tab strip shows;
- a surprise (paste stopped mirroring): `flash()`, one `ui-overlay` sentence at
  the bottom right that goes away after 4 s;
- something that needs the user: `notify()`, one sentence without counts and a
  close button.

Marks and notices float over the terminal, out of the layout flow, so they
never change the grid. Stopping a state goes through existing actions
(shortcut, Command Palette, menu), never a separate button; an owner may also
give its mark an `action` (Mirror Typing: click ↔ to stop). The pane's glyph
then becomes a `ui-icon-button` with the same look, brightening on hover, and
its tooltip adds one short sentence such as "Click to stop." A new state adds
its glyph to `stateGlyphs`; reporters pass a glyph name, a label and an
optional action, never their own visuals.

**Extension views.** The host draws the frame; a view draws only its content.
Pick the smallest presentation that fits:

- Panel views (Files, SSH Connect, Snippets) are companion tools. They are
  transparent: the host paints the panel tint. They don't repeat the tool
  name; the panel header shows it.
- Dialog views (Mirror Typing setup) are a short task over the terminal. The
  host shows a `ui-dialog` (440 px wide, up to 480 px tall) with a
  `ui-panel-header` (the view's title, then Close ×) and the view below. The
  view is transparent, doesn't repeat the title, reports its content height
  (`reportContentHeight`) so the dialog fits it, and scrolls past the maximum. A dialog isn't a
  tab, so opening one never changes the terminal grid
  ([ADR 0051](adr/0051-present-short-extension-setup-as-a-hosted-dialog.md)).
- Full-page views (Saved Layout) need room. They are tabs. The host draws the 18 px title and Close on one row, as
  Settings does, on the same page surface; the view draws no title.

## Wording

- Short, plain sentences. Name what happens, not how it's implemented.
- At most one sentence of guidance per page. Put limitations, trust details
  and edge cases in the docs and link to them with a `ui-link` "Learn more".
  Core surfaces open links through main; extension views declare the URL in
  their manifest and open it by id with `links.open.v1`
  ([ADR 0045](adr/0045-open-declared-extension-links-by-id.md)).
- No notices for success or idle states. A notice says what happened and,
  if needed, what to do next, in one or two sentences. State notices (see
  State marks) take one.
- Buttons are verbs ("Connect", "Save"), not "OK". Sentence case everywhere.
- Keep user data literal, never HTML.
- Interface Languages ship together: update English and Portuguese in the same
  change.

Verification for Settings layout lives in the
[development reference](development.md#settings-layout-matrix).
