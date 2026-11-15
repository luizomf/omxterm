# OMXTerm design system

Every DOM surface OMXTerm draws uses this system: window chrome, tabs, Settings,
the auxiliary panel, overlays, notices and the official extensions in
`extensions/`. The terminal canvas and native OS dialogs style themselves.
Third-party extensions may follow it but aren't required to.

The whole system is one stylesheet, [`src/renderer/ui.css`](../src/renderer/ui.css)
(tokens plus a few component classes), and one icon module,
[`src/shared/ui-icons.ts`](../src/shared/ui-icons.ts). The core renderer
imports the stylesheet first; official extensions get it through
`extensions/shared/appearance.css` (panel and dialog views) or by importing it
directly (full-page views). esbuild inlines both into each bundle, so packages
stay self-contained.

This page and those two files are enough to build an official surface. Read
[Rules](#rules), build from [Recipes](#recipes), then check the result against
[Do and don't](#do-and-dont).

## Rules

- **The terminal comes first.** Chrome is quiet: thin rules, soft fills, no
  shadows (the pane marks' capsule is the one exception), no decoration that
  competes with terminal output.
- **Signs over words.** A control that has an icon in the set is an icon
  button with a tooltip and an accessible name, not a word. Never a text
  glyph (`×`, `›`, `▸`, `✓`, `●`) and never an emoji. The one exception
  already exists: the severity badge that `page-notice` draws by itself.
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

| Token                                                             | Value                                     | Use                                       |
| ----------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------- |
| `--ui-surface`, `--ui-text`                                       | theme background and foreground           | page background and text                  |
| `--ui-raised`, `--ui-hover`, `--ui-selected`                      | neutral mixed into the surface 12/25/35 % | opaque fills                              |
| `--ui-raised-tint`, `--ui-hover-tint`                             | the same, faded by window transparency    | fills on overlays and cards               |
| `--ui-control`, `--ui-control-hover`, `--ui-control-selected`     | set by context (below)                    | what components read for their fills      |
| `--ui-decoration`                                                 | text at 18 %                              | hairlines                                 |
| `--ui-input-border`                                               | quietest text mix that reads 3:1          | field borders, scrollbars                 |
| `--ui-secondary`                                                  | text at 75 %                              | secondary text                            |
| `--ui-agent`                                                      | theme red, or foreground when too faint   | the agent grant's mark, nothing else      |
| `--ui-success-accent`, `--ui-warning-accent`, `--ui-error-accent` | theme green, yellow, red                  | `page-notice` severities, nothing else    |
| `--ui-overlay`                                                    | surface at window opacity                 | overlay surface                           |
| `--ui-font`, `--ui-font-mono`                                     | `system-ui`, `ui-monospace`               | all chrome; mono only for keys and code   |
| `--ui-text-meta/chrome/body/title`                                | 12 / 13 / 14 / 18 px                      | metadata, everything, unused, page titles |
| `--ui-space-1…8`                                                  | 4, 8, 12, 16, 24, 32 px                   | the only spacing values                   |
| `--ui-radius`, `--ui-radius-overlay`, `--ui-radius-chip`          | 6 / 8 / 4 px                              | controls, overlays, chips and swatches    |

Color means state, never decoration: everything is the text color or its
secondary tier, except the three notice tones and the agent mark.

**One text size.** Every surface (pages, Settings, panels, dialogs) is set in
13 px, `--ui-text-chrome`. 12 px is for metadata and key hints, 18 px for a
page title and nothing else. 14 px (`--ui-text-body`) is kept for long-form
text and no surface uses it. Hierarchy comes from the grey tiers and from
weight (400, and 600 for titles and the selected item), never from another
size.

**One control height.** Fields, selects, buttons and icon buttons are all
28 px tall. A list row (`ui-row`) is 32 px, a form row 44 px and a dense form
row 36 px. Spacing is the `--ui-space-*` scale.

**Field borders** are the quietest mix of the text color that still reads 3:1
against the surface, so a field's outline never competes with its label. The
window computes it for each theme (about 38 % on a black theme, more on
low-contrast ones); the fallback is 40 %.

**Contexts** swap the control fills so the same component reads right
anywhere:

- default (pages, Settings): opaque `--ui-raised` / `--ui-hover` / `--ui-selected`;
- `.ui-on-tint` (the auxiliary panel and the extension views it hosts, and
  views hosted in a dialog): neutral alpha layers that stack over the panel or
  dialog and fade with transparency;
- `.ui-overlay`, `.ui-dialog`: the `-tint` fills;
- `.ui-card`: one step up, so a quiet button still reads on a card.

Focus is a 2 px `--ui-secondary` outline on `:focus-visible`, never a fill.
Text fields, selects and textareas differ, because they show `:focus-visible`
on every click: their border turns `--ui-text` and they gain a 3 px
`--ui-focus-halo` (text at 14 %). A surface that focuses itself (Settings
opening) marks the control `data-quiet-focus`, which hides the outline until
the next key press. Native controls
take `color-scheme` from background luminance (light above 0.179).

## Components

| Class                               | Use it for                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page-button` + `-primary`          | The one main action of a view (Save, Connect). Foreground fill.                                                                                                                                                                                                                                                                                                               |
| `page-button` + `-quiet`            | Ordinary actions. Control fill, no border.                                                                                                                                                                                                                                                                                                                                    |
| `page-button` + `-text`             | Secondary actions in dense lists and navigation. No fill until hover.                                                                                                                                                                                                                                                                                                         |
| `ui-icon-button`                    | A 28 px square button holding one 16 px icon (close, hide, toolbars). Always give it an accessible name and a tooltip.                                                                                                                                                                                                                                                        |
| `ui-link`                           | A text link, such as "Learn more" or About's links.                                                                                                                                                                                                                                                                                                                           |
| `page-control`                      | Native text fields, selects and textareas. 28 px, control fill, input border. Checkboxes stay native, 16 px. A search field's clear button is two secondary hairlines.                                                                                                                                                                                                        |
| `ui-line-field`                     | Add to a `page-control` that heads an overlay (the Command Palette search): no box or ring, only a hairline under it.                                                                                                                                                                                                                                                         |
| `ui-actions` (`ui-actions-dense`)   | A group of buttons: wraps with an 8 px (4 px) gap. Buttons never touch.                                                                                                                                                                                                                                                                                                       |
| `ui-list` + `ui-row`                | Lists people pick from (snippets, aliases, files, palette results). Hover and selection are fills, never borders or bars. In a `role="listbox"` the active option is the only filled row: the pointer moves it, and a parked pointer takes no fill.                                                                                                                           |
| `ui-form` + `ui-form-row`           | A settings-like page: one setting per row, its name on the left, its control at the right edge, a hairline under each row. See [Forms](#forms).                                                                                                                                                                                                                               |
| `ui-form-row-dense`                 | Add to the rows of a long list of short settings (Shortcuts): 36 px instead of 44 px.                                                                                                                                                                                                                                                                                         |
| `ui-form-value`                     | The end of a row that shows a value with actions: the actions, then the value at the right edge (a shortcut's keys). They wrap together.                                                                                                                                                                                                                                      |
| `ui-field-group`                    | Several small fields that make one setting, on one row (the four sides of the terminal padding). Each is a `<label>` holding a `ui-meta` name and its field.                                                                                                                                                                                                                  |
| `ui-reveal`                         | Add to a row's action buttons that should wait out of sight: they show while the row is hovered, holds focus or has `is-active`. They keep their space and their place in the tab order.                                                                                                                                                                                      |
| `ui-nav`                            | Navigation (Settings categories). Only the selected item gets a fill and 600 weight.                                                                                                                                                                                                                                                                                          |
| `ui-switcher` (+ `ui-monogram`)     | A row of `ui-icon-button`s that shows one of a few views at a time (the side panel's tools). The current one is `--ui-text` on the selected fill (plus a tab-like underline as the window gets transparent), a hovered one takes the quieter control fill, the rest `--ui-secondary` with no fill. A view without an icon gets a `ui-monogram`: the first letter of its name. |
| `ui-tab`                            | Window tabs. Neutral alpha fills (10 %, 25 % hover, 40 % selected) with an underline that survives full transparency. The selected title is `--ui-text`, the rest `--ui-secondary`.                                                                                                                                                                                           |
| `ui-panel-header`                   | The header row of a side panel or hosted dialog: a `ui-switcher` or a truncating title, then icon buttons.                                                                                                                                                                                                                                                                    |
| `ui-card`                           | A raised block that groups one item (a catalog entry, a saved snapshot).                                                                                                                                                                                                                                                                                                      |
| `ui-choice` + `ui-choice-card`      | One of several things picked by how they look (themes). The card is a radio; the picked one has the text-colored border and nothing else. See [Choice cards and swatches](#choice-cards-and-swatches).                                                                                                                                                                        |
| `ui-choice-action`                  | The one icon button over a choice card's top corner (edit). With `ui-reveal` it waits for hover or focus.                                                                                                                                                                                                                                                                     |
| `ui-swatch-grid` + `ui-swatch`      | Colors to pick from, as rows of 28 px samples in one radio group. A ring marks the one being edited, a dashed ring one whose value isn't valid.                                                                                                                                                                                                                               |
| `ui-color-field`                    | A color's two fields on one line: the native well, then its hex text. 280 px like any field.                                                                                                                                                                                                                                                                                  |
| `ui-chip`                           | A key binding or short literal value.                                                                                                                                                                                                                                                                                                                                         |
| `ui-shortcut`                       | A key binding in a list row, as quiet secondary text (`⇧ ⌘ =` on macOS, `Ctrl+Shift+=` elsewhere), not boxed.                                                                                                                                                                                                                                                                 |
| `ui-dialog`                         | Modal overlays (About, Command Palette, previews, extension setup). Clear backdrop; the rest of the window softens.                                                                                                                                                                                                                                                           |
| `ui-overlay`                        | Non-modal floating notices (the exit notice, the panel status, drop hints, state notices).                                                                                                                                                                                                                                                                                    |
| `ui-icon` via `createIcon()`        | One icon from the set, in the current text color. See [Icons](#icons).                                                                                                                                                                                                                                                                                                        |
| `ui-mark` via `createStateMarks()`  | An ongoing state on a pane and its tab: one secondary icon (12 px on a tab; in the pane's capsule 0.8 of the terminal font size, at least 16 px) with a tooltip and accessible name, no text on screen. With an action, the pane's mark is a 24 px round `ui-icon-button` with a pointer cursor, hover background and a quick tooltip.                                        |
| `ui-popover`                        | Menus and tooltips over content in the same view. Solid surface.                                                                                                                                                                                                                                                                                                              |
| `page-notice` via `setPageNotice()` | Info, success, warning or error. Tinted block with a colored start edge; non-info severities add a glyph.                                                                                                                                                                                                                                                                     |
| `ui-hint`                           | The one sentence of guidance on a page. Secondary color, about 72 characters wide.                                                                                                                                                                                                                                                                                            |
| `ui-meta`                           | Small secondary text: counts, kinds, states.                                                                                                                                                                                                                                                                                                                                  |
| `ui-visually-hidden`                | A heading or label that only assistive technology needs.                                                                                                                                                                                                                                                                                                                      |

Build pages with `createApplicationPage(document, { title, actions,
navigation, notice, content, status })` and buttons with
`createPageButton(document, variant)` from `src/renderer/application-page.ts`.
Full-page surfaces (Settings, full-page extension views) also import
`src/renderer/application-page.css` for the page grid. Panel and dialog views
use the compact page from `extensions/shared/appearance.css` and add
`class="ui-on-tint"` to their `<html>`.

## Icons

One set for every control and mark: [Lucide](https://lucide.dev) 1.73.0
geometry at stroke 1.75, vendored as path data in `src/shared/ui-icons.ts`
(no dependency, icon font or network; licence in
`assets/licenses/lucide-ISC.txt`).

```ts
import { createIcon, setIcon } from "../shared/ui-icons"; // extensions: "../../src/shared/ui-icons.js"

const close = document.createElement("button");
close.type = "button";
close.className = "ui-icon-button";
setIcon(close, "x"); // or close.append(createIcon(document, "x"))
close.setAttribute("aria-label", t("common.close")); // the name lives on the button
close.title = t("common.close"); // and so does the tooltip
```

- **Size.** 16 px everywhere, in a 28 px `ui-icon-button` (24 px for a pane
  mark). 12 px only inside a `ui-tab`, where CSS thickens the stroke so the
  line keeps the same weight on screen. Don't set other sizes or strokes in
  surface CSS.
- **Color.** The icon takes `currentColor`: secondary for marks and quiet
  decoration (a tree's chevrons), the text color on buttons. Never a color of
  its own.
- **Outline or solid.** Outline always. Solid (`{ solid: true }`) only for a
  State Mark that needs the user: attention and agent.
- **Accessibility.** The icon is `aria-hidden`. Its host carries
  `aria-label` and `title` in both Interface Languages, or the icon sits
  beside visible text that already says it.

| Icon                            | Means                                                   |
| ------------------------------- | ------------------------------------------------------- |
| `x`                             | Close or dismiss (panel, dialog, notice, find, window)  |
| `panel-right`, `panel-left`     | Hide the side panel on that side                        |
| `chevron-right`, `chevron-down` | A collapsed or expanded row                             |
| `file`                          | A file in a tree                                        |
| `arrow-up`, `arrow-down`        | Previous or next match; `arrow-up` also "parent folder" |
| `arrow-right`                   | Go                                                      |
| `house`                         | Home folder                                             |
| `pencil`                        | Edit this item (a theme card)                           |
| `refresh-cw`                    | Reload from the source                                  |
| `folder`, `code`, `server`      | Side-panel tools: Files, Snippets, SSH Connect          |
| `folder-plus`                   | New folder                                              |
| `ellipsis`                      | More actions (opens a menu)                             |
| `square-check`, `square`        | A checked or unchecked menu item                        |
| `minus`, `square`, `copy`       | Minimize, maximize, restore the window                  |
| `move-horizontal`               | State Mark: Mirror Typing                               |
| `loader-circle`                 | State Mark: a program is working (static, never spun)   |
| `circle-small`, solid           | State Mark: a program asked for attention               |
| `diamond`, solid, `--ui-agent`  | State Mark: agents can act in this window. Nothing else |

Reuse an icon only for the meaning in this table. **To add one:** pick it on
lucide.dev, open `icons/<name>.svg` at the `1.73.0` tag of
`lucide-icons/lucide`, and copy its shapes into `icons` in `ui-icons.ts`,
keeping the list alphabetical (a `<path>` is its `d` string; any other element
is a `[tag, attributes]` tuple). Add a row here. Don't draw paths by hand or
mix in another icon family; a new State Mark also needs a `stateGlyphs` entry
and a note in ADR 0050.

## Recipes

Every recipe is DOM built in TypeScript with `textContent` and
`setAttribute`, never HTML strings. Labels come from the message catalogs. The last two rows
need the window's `StateMarks`, which only the core renderer holds; an
extension view reports through its page notice instead.

| You need                       | Build it like this                                                                                                                                                                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The view's one main action     | `createPageButton(document, "primary")`. One per view at most.                                                                                                                                                                                     |
| Any other action               | `createPageButton(document, "quiet")`; `"text"` inside rows and navigation. Group buttons in a `ui-actions` (`ui-actions-dense` in rows).                                                                                                          |
| An action with an icon         | `<button class="ui-icon-button">` + `setIcon()` + `aria-label` + `title`. No text beside it.                                                                                                                                                       |
| A text field or select         | `<input class="page-control">` inside a `<label>` whose text is the name. Search fields use `type="search"`. Placeholders are one or two words, never instructions.                                                                                |
| A toggle                       | A native `<input type="checkbox" class="page-control">` inside its `<label>`, after the name. There is no switch component.                                                                                                                        |
| A page of settings             | A `ui-form` of `ui-form-row`s. See [Forms](#forms).                                                                                                                                                                                                |
| Actions on a row               | A `ui-form-value` holding a `ui-actions ui-actions-dense` of `"text"` buttons, then the row's value. Add `ui-reveal` to the ones that can wait for hover or focus; leave visible only what also tells the user something (Reset on a changed row). |
| A list to pick from            | `<ul class="ui-list">` of `<li>`/`<button class="ui-row">`; mark the choice with `aria-selected="true"`. One line per row, truncated with an ellipsis; details go in a `ui-meta` span at the end.                                                  |
| Navigation between sections    | `<nav class="ui-nav">` of buttons; the current one has `aria-selected` or `aria-pressed`.                                                                                                                                                          |
| A switch between a few views   | `<nav class="ui-switcher">` with an `aria-label`, holding one `ui-icon-button` per view: `setIcon()`, `aria-label` and `title` with the view's name, `aria-pressed` on the current one. No words, no title beside it.                              |
| A choice between looks         | A `role="radiogroup"` grid of `ui-choice` cards. See [Choice cards and swatches](#choice-cards-and-swatches).                                                                                                                                      |
| A set of colors to edit        | A `ui-swatch-grid` beside one `ui-color-field` for the picked color, over a live sample. Never one dropdown that hides the others.                                                                                                                 |
| A key or literal value         | `<kbd class="ui-chip">`.                                                                                                                                                                                                                           |
| A page                         | `createApplicationPage(document, { title, actions, navigation, notice, content, status })`. The first child of `content` may be one `ui-hint` sentence.                                                                                            |
| A side-panel tool              | An extension panel view: `<html class="ui-on-tint">`, CSS starts with `@import "../shared/appearance.css";`, body is a compact page. No title, no header, no border: the host draws the `ui-panel-header` with the tool's icon, Hide and Close.    |
| A short task over the terminal | An extension dialog view (same setup as a panel view). The host draws the `ui-dialog`, its title and Close; the view ends in a `ui-actions` with the primary button.                                                                               |
| A result on the page           | `setPageNotice(element, { text, severity })` on one retained element with `role="status"`. Nothing for success unless the action has no other visible result.                                                                                      |
| A toast (core only)            | `stateMarks.flash(text)`: one sentence, gone in 4 s ("Layout saved."). Something the user must deal with: `stateMarks.notify(text)`.                                                                                                               |
| An ongoing state (core only)   | `stateMarks.set(pane, owner, { glyph, label, action? })`. Never your own strip, badge, dot or color.                                                                                                                                               |

## Forms

A page of settings is one `ui-form`. Each setting is one `ui-form-row`: the
name first, then the control. The row puts the name on the left and ends the
control at the content's right edge; when the two no longer fit on one line the
control wraps under the name, so a form needs no breakpoints of its own.

```ts
const form = document.createElement("div");
form.className = "ui-form";

// A field, a select or a checkbox. The row is the control's <label>: the name
// first, then the control. A toggle is this same row with type="checkbox".
const row = document.createElement("label");
row.className = "ui-form-row";
const name = document.createElement("span");
name.textContent = t("settings.fontSize");
const field = document.createElement("input");
field.type = "number";
field.className = "page-control";
row.append(name, field);

// Several small values that make one setting: a group named by its caption.
const group = document.createElement("div");
group.className = "ui-form-row";
group.setAttribute("role", "group");
const caption = document.createElement("span");
caption.id = "padding-caption";
caption.textContent = t("settings.padding");
group.setAttribute("aria-labelledby", caption.id);
const fields = document.createElement("span");
fields.className = "ui-field-group";
for (const side of ["top", "right", "bottom", "left"] as const) {
  const item = document.createElement("label");
  const sideName = document.createElement("span");
  sideName.className = "ui-meta";
  sideName.textContent = t(`settings.padding.${side}`);
  const value = document.createElement("input");
  value.type = "number";
  value.className = "page-control";
  item.append(sideName, value);
  fields.append(item);
}
group.append(caption, fields);

form.append(row, group);
```

- **Widths are the component's.** In a form row a text field or select is
  280 px, a number field 88 px, a number in a `ui-field-group` 56 px. Don't set
  other widths in surface CSS.
- **Names are the user's words**, in sentence case, without a colon: "Side
  panel position", "Right-click menu". Anything only a developer changes (log
  level, raw paths) stays in the config file and its docs.
- **One sentence under a row.** A `ui-hint` placed right after a row explains
  that row and shares its hairline. A page has one at most.
- **A long list of short rows** (Shortcuts) adds `ui-form-row-dense`. Such a
  row ends in a `ui-form-value`: a `ui-actions ui-actions-dense` of `"text"`
  buttons with `ui-reveal`, then the value itself, which ends the row. The
  list at rest shows only names and values, and nothing moves on hover. Add
  `is-active` to the row while one of its actions is in progress.
- **A labelled field outside a form** (a dialog, a panel, an editor) puts the
  name above the field: a `<label>` with `display: grid; gap: 4px`.

## Choice cards and swatches

A **choice card** is for picking one of several things you recognise by
sight. Its picture is the content, so the selection is the border: no fill,
no "Selected" word, no badge. The card's name is one truncated line; add a
`ui-meta` line under it only to tell two same-named cards apart, and put the
rest in the card's `title`.

```ts
const entry = document.createElement("div");
entry.className = "ui-choice";
const card = document.createElement("label");
card.className = "ui-choice-card";
const radio = document.createElement("input");
radio.type = "radio";
radio.name = "theme"; // one name per group; the group has role="radiogroup"
const body = document.createElement("span");
body.className = "ui-choice-body"; // the picture, then the name
card.append(radio, body);

// The card's one action is a sibling of the label, never inside it.
const edit = document.createElement("button");
edit.type = "button";
edit.className = "ui-icon-button ui-choice-action ui-reveal";
setIcon(edit, "pencil");
edit.title = t("settings.author.edit", { name });
edit.setAttribute("aria-label", edit.title);
entry.append(card, edit);
```

Set `aria-busy="true"` on the card while its choice is being saved: the border waits
one tier quieter.

A **swatch grid** shows every color of a set at once. Each `ui-swatch` is a
`<label>` painted with its color (`style.backgroundColor`, the one place a
literal color is right) around a radio whose `aria-label` is the color's
name; its `title` adds the value. Rows are `ui-swatch-row`s, eight swatches
at most, with related colors in the same column. Picking a swatch points the
single `ui-color-field` beside the grid at that color; a value that isn't a
color yet sets `aria-invalid="true"` on the radio and the swatch keeps its
last valid paint.

When a view takes over a list (the theme editor), it replaces the list in
place: same heading position, the list hidden, **Cancel** to go back. It
doesn't open under the list.

## Do and don't

- **Don't build a Christmas tree.** Each feature adding its own strip, badge,
  colored dot or status row is how a terminal stops being clean. An ongoing
  state is one State Mark; everything else is nothing, a toast or a notice.
- **Don't stack headers.** A surface has one title row at most, and the host
  already draws it (panel header, dialog header, page title). A view never
  repeats its own name, and never adds a second toolbar row of words.
- **Don't write a paragraph.** One `ui-hint` sentence per page; the rest goes
  to the docs behind "Learn more". No "Note:", no warnings about edge cases.
- **Don't label what an icon says.** Close is `x` with a tooltip, not "Close".
  Don't print an action's name on every row; show it on the hovered or
  selected row, or put it in the row's context menu.
- **Don't use color for emphasis.** No accent buttons, colored links or tinted
  cards. Weight 600 and the fill tiers carry emphasis.
- **Don't confirm the obvious.** No "Saved!" when the thing visibly changed.
- **Do** keep hover and selection as fills, focus as the outline, and borders
  for fields only. A choice card is the one exception: its picture fills it,
  so its selection is its border.
- **Do** keep every control 28 px and every text 13 px. A bigger button or a
  bolder border is never how one surface gets attention.
- **Do** check the surface on opaque black, on a transparent window and on a
  light theme: tokens make all three work unless a literal sneaks in.
- **Do** ship English and Portuguese together, tooltips and accessible names
  included.

## Surfaces

**Window chrome and tabs.** Tabs are `ui-tab` buttons in a 12 px strip whose
side insets follow the terminal's left and right padding (never under 8 px),
so the first tab lines up with the prompt. On macOS with the title bar
showing, the strip is the title row instead: 30 px tall, with 84 px kept at each end for the
traffic lights and for dragging the window. The
Linux/Windows title bar (`window-chrome.css`) uses 13 px text. Pane dividers
are 1 px hairlines; the focused pane in a split gets a 1 px accent line across its full top edge.
The selected tab's title is full text color; the others are one tier down
(`--ui-secondary`).
Default terminal padding is 12 px.

**Settings.** An 18 px title and Close above a hairline. A flat `ui-nav`.
Every category shares a 720 px content boundary; the sidebar is 168 px below
900 px viewport width and 192 px above; outer padding is 24 px, 32 px from
1200 px. Below 640 px there is no sidebar: the categories become one wrapping
row above the page, and the page keeps the only scrollbar. Each category is a
`ui-form` (see [Forms](#forms)): the name on the left, the control at the
right edge, checkboxes included. Shortcuts is a dense form: each row shows the
action and its keys as `ui-shortcut` text (`⇧ ⌘ W` on macOS, `Ctrl+Shift+W`
elsewhere); Change and Remove appear on hover or focus, and Reset shows only
on a row the user changed, which is also how such a row is told apart. A
search `page-control` above the rows filters them, and an empty result is one
`ui-hint` line. Extensions lists installed extensions as `ui-row`s with
`-text` actions and official extensions as `ui-card`s. Appearance starts
with the themes: a heading with Refresh as an icon beside it, New theme and
Import theme at the end of that line, then a grid of choice cards. Editing a
theme takes the page: its name, a swatch grid with the picked color's field,
a live sample, then the actions with one primary button.

**Auxiliary panel.** 13 px text on a 15 % neutral layer, separated from the
terminal by a hairline. The header is a `ui-switcher` with one icon per open
tool (also when only one is open) and no title: the tool's name is the icon's
tooltip and accessible name. The host picks the icon; an extension never does
([ADR 0056](adr/0056-name-side-panel-tools-with-host-owned-icons.md)). Hide is the `panel-right` or
`panel-left` icon, following the panel's side; Close (`x`) ends the tool. Extension views span the panel width so
their 12 px padding lines up with the header's first icon.

**Overlays.** One recipe: `--ui-overlay` surface, 1 px hairline, 8 px radius, no
shadow, quiet buttons, Close as an `x` icon button. While a `ui-dialog` is modal a fixed 12 px CSS filter
softens the other body children; it's independent of the native `window.blur`
preference. The startup configuration banner is the one exception: a
full-width red strip, because OMXTerm fell back to defaults.

**State marks.** One system for state, from `src/renderer/state-marks.ts`
([ADR 0050](adr/0050-show-ongoing-states-as-quiet-state-marks.md)); never add
a strip, badge or color of your own. Pick the quietest tier that works:

- idle or success: nothing, except that an explicit action with no other
  visible result may confirm itself with `flash()` (Save layout: "Layout
  saved.");
- something ongoing (mirroring, a program working, later an SSH session): a
  `ui-mark` icon in the pane's capsule, repeated once before the title on its
  tab when the tab strip shows. A window-wide state (`setWindow()`, an agent
  grant) marks every pane and tab, and the page's top-right corner when no
  pane shows. An outline is ambient; a solid shape needs the user. Only the
  agent grant's diamond takes a tone, `--ui-agent`, because it means agents
  can do anything you can here;
- a surprise (paste stopped mirroring): `flash()`, one `ui-overlay` sentence at
  the bottom right that goes away after 4 s;
- something that needs the user: `notify()`, one sentence without counts and a
  close button.

**The capsule** (`.state-marks`) is the marks' one home on a pane: a fully
round pill at the top-right corner, centered on the first text row, that
tints (surface at 86 % with 16 % neutral) and blurs the output under it, with
a faint top rim and a soft shadow. It is only as wide as its marks (a 24 px
target each, about 28 px for one mark, 100 px for four) and disappears
with the last one. Marks grow with the terminal font: the target is one text
row, the icon 0.8 of the font size. Nothing else uses this look: no other
chip, pill or blurred surface floats over the terminal.

Over the terminal, the find bar owns the top-right corner. While it is open
the capsule moves just below it, so the two never overlap. A new overlay in
that area must do the same, and must never cover the agent's mark.

Marks and notices float over the terminal, out of the layout flow, so they
never change the grid. Stopping a state goes through existing actions
(shortcut, Command Palette, menu), never a separate button; an owner may also
give its mark an `action` (Mirror Typing: click the mark to stop). The pane's
mark then becomes a `ui-icon-button` with the same look, brightening on hover,
and its tooltip adds one short sentence such as "Click to stop." A new state
adds its icon to `stateGlyphs`; reporters pass a glyph name, a label and an
optional action, never their own visuals.

**Extension views.** The host draws the frame; a view draws only its content.
Pick the smallest presentation that fits:

- Panel views (Files, SSH Connect, Snippets) are companion tools. They are
  transparent: the host paints the panel tint. They don't repeat the tool
  name; the panel header's icon carries it.
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

- Short, plain sentences. Name what happens, not how it's implemented. Use the
  user's words (tab, pane, window, settings), not the glossary's.
- A tooltip is a name or one short sentence. If a control needs more than its
  tooltip to be understood, change the control.
- At most one sentence of guidance per page. Put limitations, trust details
  and edge cases in the docs and link to them with a `ui-link` "Learn more".
  Core surfaces open links through main; extension views declare the URL in
  their manifest and open it by id with `links.open.v1`
  ([ADR 0045](adr/0045-open-declared-extension-links-by-id.md)).
- No notices for success or idle states, except one: an explicit action with
  no other visible result (Save layout) may confirm itself with one brief
  `flash()` sentence ("Layout saved."). A notice says what happened and, if
  needed, what to do next, in one or two sentences. State notices (see State
  marks) take one.
- Buttons are verbs ("Connect", "Save"), not "OK". Sentence case everywhere.
- No ellipsis outside menus: the `…` promises a dialog in a menu and is noise
  on a button or in a list. (An ongoing state keeps it: "Saving…".)
- Keep user data literal, never HTML.
- Interface Languages ship together: update English and Portuguese in the same
  change.

Verification for Settings layout lives in the
[development reference](development.md#settings-layout-matrix).

## Default shortcuts

- Terminal and core actions use `Cmd/Ctrl+Shift+<letter>`, and only when the
  letter is free on macOS, Linux and Windows; otherwise the action ships
  unbound.
- Side-panel and extension tools use `Cmd+Option+<letter>` on macOS only.
  Linux and Windows leave them unbound: `Ctrl+Alt` is AltGr on Windows and
  types characters on international layouts (on ABNT2, `Ctrl+Alt+Q` types
  "/"), and Linux desktops reserve many `Ctrl+Alt` combinations.
- Older defaults predate this and stay: Snippets keeps `Ctrl+Shift+S` on Linux
  and Windows, and Mirror Typing uses `Cmd/Ctrl+Shift+M`.
