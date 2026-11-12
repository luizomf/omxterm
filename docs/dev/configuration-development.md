# Configuration development notes

[User configuration](../configuration.md) covers what users set. This page lists
the edge cases behind those settings that matter when you change them. The
terminal context menu and the font-read race during reload are in the
[usage development notes](usage-development.md). The
[product contract](../spec.md) is the full behavior reference.

## Configuration folder

- A nonempty `XDG_CONFIG_HOME` selects its `omxterm` subdirectory on every
  platform. Otherwise OMXTerm uses `.config/omxterm` under the OS account home,
  ignoring an overridden `HOME` or `USERPROFILE`.
- First launch creates `config.json` and `themes/omtheme.json`. Only Windows x64,
  which has built-in Snippets, also creates `snippets.yaml`. Optional Snippets
  leaves it absent until the user creates it.
- Relative `theme.path` values resolve against the logical configuration folder,
  even when `config.json` is a symlink to somewhere else.

## Settings tab

- Switching away keeps the selected category, drafts, caret, scroll and pending
  save results. **Close Tab** or **Close** discards them without a prompt and
  never saves raw JSON. Escape doesn't close the tab.
- Opening Settings doesn't resize the window or change its minimum size.
- Terminal-only actions (pane, Find, zoom, snippet, file drop) do nothing there.
  Copy, Paste and Select All edit the focused field, never a hidden terminal.
- Selecting Settings suspends the Auxiliary Panel. Returning to a terminal
  restores the selected tool without reopening a closed one.
- About and image previews can open over Settings and make it inert, then
  restore its focused control. The Command Palette can open above it too.

## Saving from Settings

- Rapid theme or transparency choices replace earlier queued choices for the same
  control that haven't started; a save already running finishes. The replaced
  choice reports that a newer choice superseded it, which is not a saved
  confirmation.
- "Saved to config.json, but it could not be applied" means the file was written
  and the reload failed; some settings may already be active.
- Clearing a text or number field removes that entry, so the default applies.
- Settings rewrites only the edited field, keeps the rest of the file (including
  edits made elsewhere) and writes two-space indentation. If it detects an
  external edit or a changed link destination during validation or write
  preparation, it refuses and asks for a reload.
- Saves follow `config.json` symlinks, relative links, link chains and linked
  directories, and replace the regular target atomically while keeping the links.
  Dangling or cyclic links and non-regular targets are refused. The target
  directory must allow creating and replacing files.
- A new `config.json` is created with mode `0600` where supported; inherited
  ACLs still apply. If cleanup fails, Settings warns that a temporary file may
  remain next to the target.
- Atomic replacement keeps basic permission bits but creates a new file entry.
  Other hard links keep the old contents, and ownership, ACLs and extended
  attributes may not survive.
- The final conflict checks reduce races with other editors but don't lock them
  out. A change right after a check can still interfere.

### Config File page

If `config.json` changes on disk while the user edits it, the draft is kept and
**Save** is refused until **Reload File**. Save and Reload File are disabled while
a request is pending. Typing continues, but newer text isn't part of the earlier
Save. Reload File replaces the draft only if the user hasn't typed during its
read.

## Language

- A successful save or reload switches the menu and every open window. Open
  editors keep drafts, selected page, focus, caret, scroll and pending saves. An
  open snippet preview keeps its captured pane even if that terminal ended.
  Panes still initializing pick up the latest labels.
- These stay in English: validation detail inside a reload notice, technical
  cause detail inside a Terminal Surface failure notice, failures before
  configuration loads, logs, snippet file diagnostics and text owned by the OS.
  JSON, paths, snippet contents and terminal output are never translated.

## Shortcuts

### Recorder

- **Settings → Shortcuts** lists every remappable application action. OS
  shortcuts, text editing inside fields and fixed context gestures are not
  listed. Escape (hide the Auxiliary Panel) and Left/Right/Home/End on a focused
  separator can't be rebound.
- Plain Escape cancels recording; modified Escape can be recorded. A letter needs
  Ctrl, Alt, Cmd or AltGr. F1–F24 can stand alone.
- On macOS, Option alone can record top-row digits and some letters from the
  current layout, limited to ordinary letter and digit positions and single ASCII
  letters. Dead keys, input methods and other characters may not record; some
  dead-key sequences never reach the recorder and leave it waiting.
- The recorder consumes shortcut candidates with their repeats and releases. Keys
  reported as composing go to the normal input path.
- Recording ends without saving on Cancel, leaving the page or tab, opening
  Command Palette, a modal preview or About, losing button or window focus, or
  after 30 seconds. A late result from an old recording can't change a newer one.
- While recording, tab-navigation shortcuts are candidates, so the user must
  cancel or use the pointer or menu to switch tabs.

### Validation

- A collision is rejected with the same message in Settings and in `config.json`,
  and the file stays unchanged. OMXTerm never reassigns another action's key or
  rewrites the file.
- On macOS, Option-only top-row and keypad shortcuts for the same digit (`Alt+9`
  and `Alt+num9`) collide. A file that has both fails validation.
- On Linux and Windows, binding a bare `Ctrl+<key>` that terminal programs use
  (like `Ctrl+C`) is accepted with a warning.
- `+` is written as `Plus`; other punctuation is literal.

### Panel shortcuts

- `toggleFiles` and `toggleSshConnect` are unbound by default and can be set
  before the tool is installed. A missing, disabled or unsupported tool doesn't
  consume the key, but the binding still counts for conflicts. A held key acts
  once: it closes a selected visible tool, reveals a hidden or unselected one and
  opens a closed one.
- `toggleMirrorTyping` is Mirror Typing's slot and defaults to `Cmd+Shift+M`
  (`Ctrl+Shift+M` on Linux and Windows). Like the tool slots, it consumes its
  key only while Mirror Typing is installed and enabled, still counts for
  conflicts and acts once per press. It stops the window's running or
  preparing group, else closes a shown setup dialog, else opens setup; other
  windows' groups are never touched.
- `toggleAuxiliaryPanel` hides and reveals without closing tools. With no tools
  open it lazily opens installed, enabled Snippets (built in on Windows x64). If
  Snippets is unavailable, it shows one four-second notice per process; it never
  installs, enables or jumps to Settings.
- `moveAuxiliaryPanel` moves the panel once per physical press, for the focused
  window's lifetime, including while Settings or a hosted tab is selected. It
  doesn't reveal a suspended panel or rewrite `window.auxiliaryPanelSide`, and a
  modal blocks it. Changing the saved side clears the window's temporary choice.
- `window.auxiliaryPanelSide` applies live to every window without reopening tools
  or losing drafts or focus. Panel width and visibility are window-local and kept
  in memory only.

## Window and terminal settings

- `scrollback.lines` is kept in memory per pane, under a 10 MB per-screen core
  ceiling. `0` clears and disables history.
- `keyboard.optionAsAlt` changes terminal input only, never shortcut recording or
  matching.
- `windowsShell` takes only an executable path, with no flags or environment
  variables. macOS and Linux ignore it and use the account's login shell.

## Transparency and blur

- Text, cursor, selection and inline images stay fully opaque.
- **Settings → Appearance** has a 0–100% slider in 1% steps (arrows adjust it,
  Home/End jump to the ends) and a **Blur desktop background** checkbox. Each
  change goes through the normal reload path.
- Programs that paint an explicit cell background (Neovim, `btop`) stay opaque
  unless they use the default background (`SGR 49`).

| Platform | Behavior                                                                                                                                     |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS    | Native background blur, with a system vibrancy fallback.                                                                                     |
| Windows  | Windows 11 Acrylic needs both `window.blur: true` and transparency above `0`. With blur off, the window stays opaque.                        |
| Linux    | Transparency uses the X11/XWayland compositor. KDE Plasma honors `window.blur` via `xprop`; GNOME and Hyprland set blur in desktop settings. |

Compositor setup lives in the [Linux desktop guide](../linux-desktop.md).

## Snippets

Availability and installation are in the
[Snippets availability note](../snippets-availability.md) and the
[migration guide](snippets-migration.md).

- New packaged profiles try once to install the
  [removable default Snippets](default-snippets.md), enabled but inactive until
  opened. Existing profiles, YAML and disabled or removed choices are left alone,
  and no user YAML is created. Removing it never triggers a reinstall. Developer
  startup, `--user-data-dir` and Windows x64 are excluded.
- `snippets.yaml` is one UTF-8 YAML 1.2 core document of at most 1 MiB, with at
  most 16 levels of collection nesting and 4,096 mapping pairs and sequence
  entries. Duplicate keys, aliases, custom tags and multiple documents are
  rejected.
- Up to 512 snippets. `name` is 1–128 characters, `body` 1–65,536 and
  `description` at most 512 (UTF-16 code units). `execute` must be a boolean.
  Unknown fields are rejected.
- `execute: false` appends no Enter, but embedded line breaks or control
  characters can still run commands. Multiline and control-character bodies use
  the Protected Paste confirmation when bracketed paste is off.
- Opening the sidebar rereads the catalog. Hide and reveal keeps the query and
  scroll; Close and reopen starts fresh. Old rows can't run while loading.
  Invalid files show the path and a safe diagnostic with line and column, never a
  command excerpt.

## Themes

A valid theme has `"version": 1`, a single-line `name` of 1–64 characters and all
21 colors as `#RRGGBB`. Reads are limited to 256 KiB of UTF-8 JSON. Unsupported
fields and partial palettes are rejected, never stripped. At startup, an invalid
theme falls back to the bundled `omtheme`. [`omtheme.json`](../omtheme.json) is the
canonical palette.

To convert a Ghostty theme from a source checkout:

```sh
node scripts/convert-ghostty-theme.mjs input-theme output-theme.json
```

### Local theme picker

- **Settings → Appearance** lists version-1 JSON files placed directly in
  `themes/` beside the logical `config.json`. The folder and the files may be
  symlinks. Cards show name and path, so same-named themes stay distinct.
- **Bundled omtheme** removes `theme.path`. It is distinct from the editable
  `themes/omtheme.json` copy.
- Discovery reads at most 2,048 directory entries, 128 JSON candidates, 256 KiB
  per theme and 4 MiB of configuration. It doesn't watch for changes; the user
  chooses **Refresh themes**. Missing folders, unreadable or invalid files and a
  truncated list are reported. Discovery never edits theme files.
- A custom path outside `themes/` may not show as a selected card; the
  **Theme file (advanced)** field still accepts relative or absolute paths.

### Author a theme

- One inline editor is open at a time. **Edit theme** doesn't select the card.
- Invalid partial color text stays with its role when switching roles or
  categories and must be fixed before Save or Export. The specimen shows the
  last valid colors.
- The palette preview pairs each normal color with its bright variant, shows `Aa`
  text on the draft background and a solid square. It never runs a shell or
  changes the real terminal, the surrounding Settings colors or transparency.
- **Save** writes an opened local theme against its original revision. It follows
  file and directory links to the regular target and keeps the links. An
  external edit or retarget refuses the save and keeps the draft; the user picks
  **Discard draft and reload source** or **Save copy**. There is no automatic
  rebase or retry.
- **Save copy** creates a new file directly in `themes/` and never replaces an
  existing entry, including a broken link. Later Saves update the copy. New,
  bundled and imported themes always start with Save copy, and importing never
  authorizes overwriting the imported file.
- Saving doesn't apply the theme. **Use saved theme**, available once all edits
  are saved, writes its path through the normal Settings path and reloads the
  whole configuration. A failed activation leaves the file saved.
- **Export JSON…** writes the complete valid draft to a new file. It never
  replaces an existing file, even if the OS dialog offers to. Export doesn't
  select the theme, mark the draft saved or retarget later Saves.
- Optional `appearance` values survive import, edit, save, copy and export,
  including omitted members, `null` and `{}`. Saves keep values but reformat with
  two-space indentation and a trailing newline.
- Switching categories or tabs keeps the draft, selected role and pending result.
  Closing Settings discards unsaved edits without a prompt. **Cancel** discards
  only the editor, not files or writes already requested. Results name newer
  edits that weren't included, and closed editors ignore late results.
- Theme writes use the same guarded replacement and metadata limits as
  [Settings saves](#saving-from-settings). New files are published complete
  through a hard link, so filesystems without hard links fail instead of
  overwriting. A cleanup warning after publication means the file was written
  but a temporary file may remain. When a result can't be confirmed, the user
  refreshes before writing again.

### Pane and panel appearance

A version-1 theme can add `appearance` next to `colors`:

```json
"appearance": {
  "paneDivider": "#505068",
  "auxiliaryPanelDivider": null,
  "activePaneHighlight": "#80d4ff"
}
```

Each field is optional, and `appearance: {}` is valid.

| Field                   | Omitted                                                     | `#RRGGBB`                                  | `null`                                 |
| ----------------------- | ----------------------------------------------------------- | ------------------------------------------ | -------------------------------------- |
| `paneDivider`           | Neutral line, brighter on hover and drag                    | Exact color at rest, hover and drag        | Hides decorative pane divider paint    |
| `auxiliaryPanelDivider` | Same neutral defaults                                       | Exact color at rest, hover and drag        | Hides decorative panel divider paint   |
| `activePaneHighlight`   | Theme cyan, or foreground when cyan has too little contrast | Exact color, without contrast substitution | Hides the active split pane's top line |

- Reload repaints existing windows. Omitting a field restores the default rather
  than keeping an earlier override.
- These colors change no resize target, layout space, keyboard control or
  terminal behavior. The panel never gets an active-pane highlight, and the
  active pane's marker is an inset 1 px top line, not a ring.
- A keyboard-focused separator always paints its 1 px line in the theme
  foreground, even with `null` or while dragging.
- Only these three keys with hex or `null` are accepted. `appearance` itself
  must be an object, and the 21 palette colors stay non-nullable. Builds that
  predate `appearance` reject it. Settings has no controls for these
  roles.

## OMXTerm Studio

[OMXTerm Studio](https://luizomf.github.io/omxterm-studio/) is a browser-only
palette editor with a 0.17.1-dev.0 compatibility baseline. It rejects newer fields
such as `language`, `window.auxiliaryPanelSide` and theme `appearance`, and it has
an older shortcut vocabulary. It can still import a theme with only `version`,
`name` and `colors`.

## Reload

| Scope                 | Settings updated                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| Existing and new tabs | Theme, font size, ligatures, padding, scrollback, Option keys, terminal context-menu eligibility |
| All windows and tabs  | Background transparency, blur and Auxiliary Panel side                                           |
| App behavior          | Close confirmation, log level, keyboard shortcuts, language                                      |
| New tabs (or restart) | Font family, line height, Windows shell                                                          |
| New windows           | Always-on-top, title bar and tab bar defaults                                                    |

- The footer names pending font-family and line-height changes while any pane,
  including one still initializing, uses an older value. Each field clears when
  those panes close, across windows, without another reload.
- Font and configuration errors stay visible until a successful reload. Closing
  an old pane doesn't dismiss an unrelated error.
