# UX and UI design system

The port adds chrome around the terminal: sidebars, modals, menus, banners
and indicators. All of it follows one small system in
`src/renderer/workspace.css`, so new UI is consistent and themable without
per-feature styling.

## Tokens

Defined on `:root`:

- **Spacing:** `--omx-space-1` … `--omx-space-4` (4, 8, 12, 16 px).
- **Radii:** `--omx-radius` (6 px) and `--omx-radius-large` (10 px).
- **Type:** `--omx-font`, 13 px system UI.
- **Colors** derive from the active Terminal Theme:
  - `--omx-foreground` is the theme foreground;
  - `--omx-muted`, `--omx-surface`, `--omx-surface-raised` and
    `--omx-border` are `color-mix()` blends of the theme background,
    foreground and chrome neutral;
  - the fixed semantic colors are `--omx-accent`, `--omx-warning` and
    `--omx-danger`.
- **Focus:** `--omx-focus-ring` on every interactive element.

Because chrome mixes from the theme, light, dark and custom themes need no
extra styling.

## Components

| Component       | Classes                                                                                          | Used by                                                            |
| --------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Modal dialog    | `.omx-modal`, `-body`, `-actions`; `.omx-button-*`                                               | session editor, command forms, backup, tab color, highlight editor |
| Form fields     | `.omx-form`, `.omx-field`, `-hint`, `-error`, `.omx-section`, `.omx-checkbox`, `.omx-path-input` | every form; errors sit under their field                           |
| Context menu    | `.omx-context-menu`                                                                              | sessions, commands, tabs, tab groups                               |
| Toasts          | `.omx-toasts`, `.omx-toast` (polite live region)                                                 | operation results                                                  |
| Sidebar         | `#workspace-sidebar`, `.workspace-sidebar-*`, `.sessions-*` rows                                 | Sessions and Commands panels                                       |
| Pane chrome     | `.terminal-pane-split`, `.terminal-pane-divider`, `.pane-ended-banner`                           | split panes, Reconnect                                             |
| Indicators      | `.broadcast-indicator`, `#tab-strip .tab-broadcasting`, `.tab-group-chip`                        | broadcast, tab groups                                              |
| Command palette | `.command-palette`                                                                               | View → Command Palette                                             |

The behavior lives in a few shared modules:

- `ui/modal.ts` provides `openModal`, `confirmAction` and `promptText`.
- `ui/context-menu.ts` provides the context menu.
- `ui/form.ts` provides the form fields.

Features compose them rather than building their own dialogs.

## Interaction and accessibility rules

- **Keyboard.** Everything reachable by mouse is reachable by keyboard.
  - Rows and tabs open menus with the context menu key or `Shift+F10`.
  - Lists move with arrow keys.
  - In a modal, Enter submits the primary action and Escape cancels.
  - Pane dividers are `role="separator"` and resize with arrows.
- **Focus.** Modals focus their first field (or a chosen element) and
  return focus to where it was on close. The palette runs its action only
  after focus is back on the terminal.
- **Semantics.**
  - Tabs are `role="tab"`, the Sessions panel is a `tree`, and the Commands
    list is a `list`.
  - The palette input is a `combobox` with `aria-activedescendant`.
  - Color swatches are `radio` items with translated names.
  - Group chips expose `aria-expanded`.
- **Feedback.** Validation errors appear next to the field in the user's
  language. Toasts use a polite live region, created on first use so hidden
  chrome adds nothing to the page.
- **Preferences.** `prefers-contrast: more` strengthens borders and muted
  text. Motion is enabled only under
  `prefers-reduced-motion: no-preference`.
- **Laziness.** Sidebars, the palette and dialogs create no DOM until first
  used, so startup and existing tab queries are unaffected (R14).

## Gaps

- No `forced-colors` (Windows High Contrast) pass yet.
- The native application menu and native confirmations are English only
  ([11-configuration-and-internationalization.md](11-configuration-and-internationalization.md)).
- No screen-reader walkthrough has been recorded; the semantics above are
  checked by unit tests and inspection only.
