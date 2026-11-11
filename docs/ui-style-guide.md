# OMXTerm UI style guide

Short rules for every DOM surface OMXTerm draws: window chrome, tabs, Settings,
the auxiliary panel, overlays and notices. The terminal canvas, native OS
dialogs and installed extension views style themselves.

## Principles

- **The terminal comes first.** Chrome is quiet: thin rules, soft fills, no
  shadows, no decoration that competes with terminal output.
- **Few words.** At most one short sentence of guidance per page or section.
  Details live in the docs. A successful action needs no notice.
- **Few buttons.** Prefer one clear action per row. Secondary actions are text
  buttons; destructive or rare ones stay out of the way.
- **One system.** Every surface uses the same tokens below. Don't add local
  fonts, radii, colors or button styles.

## Tokens

All tokens live in `src/renderer/ui-tokens.css` and derive from the active
Terminal Theme, so light and dark themes need no separate rules.

- **Color.** `--ui-surface` and `--ui-text` come from the theme. Neutral chrome
  (`#808090`) mixes into the surface at 12% (`--ui-raised`), 25% (`--ui-hover`)
  and 35% (`--ui-selected`). Foreground mixes at 18% for hairlines
  (`--ui-decoration`), 55% for input borders and 75% for secondary text. The
  `-tint` variants scale with window transparency.
- **Font.** `--ui-font` (`system-ui`) everywhere. Never `-apple-system` or a
  bare `sans-serif`: they resolve to other faces on Linux and Windows.
  Monospace only for shortcut bindings, terminal samples and the JSON editor.
- **Type scale.** 12 px metadata and chrome labels, 13 px chrome text (tabs,
  panel, banners, JSON editor), 14 px body and section titles (600 weight),
  18 px page titles. Nothing else.
- **Spacing.** 4, 8, 12, 16, 24 and 32 px.
- **Radius.** `--ui-radius` (6 px) for controls, `--ui-radius-overlay` (8 px)
  for overlays and floating notices, 4 px for chips and swatches.
- **Focus.** A 2 px foreground outline. Decoration is never focus.
- **Native controls** take `color-scheme` from background luminance (light
  above 0.179), not the OS appearance.

## Controls

Application pages compose with `createApplicationPage(document, { title,
actions, navigation, notice, content, status })` from
`src/renderer/application-page.ts`. Create buttons with
`createPageButton(document, variant)` and apply `page-control` to native
fields, keeping their labels and keyboard behavior.

- **Primary:** foreground fill. One per view at most (for example, Save).
- **Quiet:** raised fill. Ordinary actions. On a raised card, step up to the
  hover tint so the button still reads as one.
- **Text:** no fill, secondary color in dense lists. Always visible.
- Controls are at least 36 px tall; compact row actions are 28 px.
- Button groups wrap with an 8 px gap (4 px in dense rows). Buttons never
  touch.
- Checkboxes stay native. Disabled controls stay recognizable and keep their
  accessible names.
- Application surfaces use thin scrollbars in the input-border color on a
  transparent track. The terminal keeps its own scrollbar.

## Window chrome and tabs

- Tabs use 12 px text, a 10% neutral fill, and a 40% fill for the selected
  tab, which also keeps a 1 px underline when transparency removes the fill.
- The Linux/Windows title bar uses 13 px text and the same hover fill as tabs.
- Pane dividers are 1 px hairlines that strengthen on hover; the focused pane
  in a split gets a 1 px accent line on top.
- Default terminal padding is 12 px on every side.

## Settings

- Header: an 18 px title and Close above a hairline.
- Navigation is flat: only the selected category gets a fill.
- Every category shares a 720 px content boundary. The sidebar is 168 px below
  900 px viewport width and 192 px above; outer padding is 24 px, 32 px from
  1200 px.
- Form pages read as one list: each row has 12 px vertical padding and a
  hairline below it. Labels sit left, fields end at the content edge. Fields
  are at most 384 px wide (number inputs 112 px). Below 560 px of content
  width, labels sit above their fields.
- Shortcut rows are at least 48 px tall: name, binding as a monospace key chip
  (at most 200 px wide), and compact actions. Only Custom and Unbound are
  labelled; an unmarked binding is the default. Below 600 px of content width
  the actions take their own line.
- Prose stays near 72 characters wide. Content and navigation scroll
  independently. `.application-page-content` is the only size-query container.
- Settings is comfortable at 640×480. Below 640 px the sidebar stays while
  there's room (480–639 px); below 480 px categories become a two-column
  scrolling grid. Short windows scroll instead of clipping.
- The theme editor shows each normal ANSI color next to its bright variant and
  lets a swatch pick the role to edit.

## Auxiliary panel

- 13 px text on a 15% neutral fill, separated from the terminal by a hairline.
- The header holds the tool name, or a single-line switcher when several tools
  are open. Long names truncate; the active tool gets a fill.
- Hide is a chevron toward the panel's edge; Close (×) ends the tool. Both have
  tooltips.
- Extension views span the panel width so their own padding lines up with the
  panel title.

## Overlays

About, Command Palette, Local Image Preview and the Snippets preview share one
recipe:

- `--ui-overlay` surface (follows window transparency), a 1 px
  `--ui-decoration` hairline, `--ui-radius-overlay`, no shadow.
- A clear backdrop. While any of them is modal, a fixed 12 px CSS filter
  softens the other body children; it restores itself on dismissal and is
  independent of the native `window.blur` preference.
- Quiet filled buttons; About's links are one line of text links.
- The Command Palette opens straight to its search field; its title is
  visually hidden but still names the dialog.

The SSH exit notice uses the same surface as a small floating card.

## Notices

- `setPageNotice(element, { text, severity })` with `info`, `success`,
  `warning` or `error`. The caller supplies `role="status"` or `role="alert"`.
  Empty notices hide; updates never take focus.
- A notice is a tinted block with a 4 px colored start edge and no outer
  border. Success, warning and error add a centered glyph in a circle, so
  color is never the only signal. Text keeps the theme foreground.
- Keep user data literal, never HTML.
- The startup configuration banner stays a full-width red strip: it means
  OMXTerm fell back to defaults.

## Wording

- Short, plain sentences. Name what happens, not how it's implemented.
- No notices for success or idle states.
- Put limitations, trust details and edge cases in the docs and link to them.
- Interface Languages ship together: update English and Portuguese in the same
  change.

Verification for Settings layout lives in the
[development reference](development.md#settings-layout-matrix).
