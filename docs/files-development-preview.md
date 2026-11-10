# Files extension development

Files is an optional extension for browsing local folders. It can create,
rename, move, trash and delete entries, and insert a path into the terminal. It
is installed separately from OMXTerm and runs only on Linux ARM64 and macOS
ARM64. It is a development preview, not a stable extension SDK.

[Files availability](files-availability.md) covers what users do. This page
covers how Files is built and how to change, test and ship it. The "why" lives
in the ADRs: [immutable installed packages](adr/0038-pin-immutable-installed-packages.md),
[packaged web content by epoch](adr/0039-own-packaged-web-content-by-epoch.md),
[backends in owned Node children](adr/0040-run-backends-in-owned-node-children.md)
and [protected path insertion](adr/0021-insert-lexical-shell-quoted-paths-through-protected-paste.md).

## Package

The source lives in `extensions/files/`. It is never imported into Electron main
or the terminal renderer; it ships only as a `.omxext` archive.

- `extension.json` — ID `omxterm.files`, version, host range, API range and
  capabilities. The builder reads version and compatibility from here.
- `backend.ts` — the Node backend that lists and changes the filesystem.
- `view.ts`, `page.ts`, `tree.ts`, `toolbar.ts`, `messages.ts`, `index.html`,
  `files.css` — the view page shown in the companion panel.

Files 0.8.0 declares host `>=0.26.0`, API `0.1.x` and the
`terminal.insertPath.v1` capability. Host 0.26.0 is the first published host
with the protected path consumer, so older hosts neither offer nor admit 0.8.0.
The narrow [development bridges](extension-installation-foundation.md#archive-contract)
admit some archives on matching prerelease hosts. Admission checks host, API and
capability grammar, not platform qualification.

Published archives are immutable. A source change ships as a new version; never
replace or republish existing versioned bytes. Older archives keep their
original behavior even on a newer host.

## Backend

The backend runs in an owned Node child (see
[extension backend runtime](extension-backend-runtime.md)). The host gives it a
`context.files` service from `src/extension-runtime/files-services.ts`, with
`moveNoReplace` and, on macOS, `trash`.

Listing:

- Directories are read with `opendir` and sequential `lstat`. Each folder visits
  at most 5,000 entries and reports truncation.
- Replies carry at most 100 rows. At most eight backend invocations run at once.
- Up to eight listing snapshots, eight delete confirmations and eight move
  confirmations are kept. At capacity, a new request expires the oldest token of
  that kind. In-flight reads still count and are never evicted.
- Expired cursors need an explicit refresh. Expired confirmations need a fresh
  confirmation and are never rebound to another entry.
- There are no watchers, timers or polling. Links are labeled and never
  followed.

Mutations:

- New file creation is exclusive and new folder creation is nonrecursive, so
  neither overwrites an existing entry.
- Rename and move use the host's native no-replace move. There is no
  check-then-rename and no copy/delete fallback. Collisions, permission errors,
  unsupported filesystems and cross-device moves fail explicitly.
- Permanent deletion needs a one-shot confirmation token bound to the entry's
  path, device and inode. This guards against UI retargeting, not against a
  hostile same-user race. Recursive deletion can fail after partial effects and
  is then reported as outcome-unknown.
- Linux trash runs `/usr/bin/gio trash -- <path>` with no shell, an
  eight-second timeout and bounded output.
- macOS trash uses Foundation `NSFileManager` in the native addon's worker
  pool. The OS picks the Trash location; there is no Finder automation. The host
  rejects root, trailing separators and empty or dot components, and keeps the
  original path spelling so normalization can't bypass that check. Foundation
  has no cancel or timeout, so the runtime's ten-second request deadline and
  child retirement apply. The resulting Trash path is not returned to the view.
- Unavailable or failed trash never falls back to permanent deletion. A
  dispatched trash failure is reported as unknown. No failed or uncertain
  mutation is retried automatically.

Successful create, move, trash and delete refresh the current root and the
expanded folders that still exist, keeping the selection where possible. A late
result never navigates back to an old root. Refresh errors stay visible.

## Native addon

`npm run build` compiles `native/files-move.cc` into
`dist/extension-runtime/files-move.node` through `scripts/build-files-move.mjs`. It is a small
Node-API 8 worker-pool adapter with fixed error categories and at most 32
pending calls, shared by move and trash.

- Linux ARM64: `renameat2(RENAME_NOREPLACE)`.
- macOS ARM64: `renameatx_np(RENAME_EXCL)`, plus `native/files-trash-macos.mm`
  linked against Foundation. It targets the macOS 12 deployment floor.

Other targets build no addon. There, `moveNoReplace` refuses with `ENOTSUP`;
there is no overwrite fallback.

## View

The page shows expandable folders with nested rows.

- Click selects; the disclosure arrow, double-click or Right/Left expand and
  collapse. Up/Down and Home/End move through visible rows; Enter/Space toggles
  a folder. Focusing a row selects it.
- The toolbar has Home, Up, Refresh, New folder and Actions, plus an address
  field with Go (Enter also works). Each icon has a localized accessible name and
  tooltip. Up stays focusable but disabled at the filesystem root.
- **Filter loaded entries** gets focus when Files opens. It filters names already
  loaded in expanded folders; it is not a recursive search and never reads the
  disk. Ancestors of matches, loading, error and truncation rows stay visible.
- **Actions… → Show dotfiles** is off by default. It hides dot-prefixed names
  and their descendants under the current root. It ignores macOS `UF_HIDDEN` and
  Linux `.hidden` files. The view shortcut is `Ctrl+H` on Linux and
  `Cmd+Shift+.` on macOS; it never claims text fields, composition, editors or
  pending confirmations.
- Filter text and the dotfile choice survive navigation and hide/reveal. Close
  and a new view reset them. Neither is a saved preference or a security
  boundary.
- **Actions…**, right-click, Shift+F10 or the context-menu key open the menu; F2
  opens Rename / move. Editors keep their captured paths if the selection or
  root changes. Cancel returns focus to the opener when it still exists.
- In the companion panel, a fresh non-composing Escape belongs to the host and
  hides the whole panel, keeping operation drafts. A composing Escape stays with
  the focused control.
- A row can be dragged onto a directory row, or moved with **Move to folder…**.
  Both show a fixed source and destination and need an explicit **Move**. Moves
  within the same folder, into the source itself or a descendant, or onto a
  symlink row are refused. The backend rechecks source and folder identity before
  the no-replace move.

Files follows the host's `en-US` / `pt-BR` language. Language and theme changes
relabel and restyle in place without listing again or losing focus, drafts,
selection or confirmations. File names, paths and backend error codes stay
literal. The stylesheet is bundled and loads no remote resources.

## Inserting paths into the terminal

Files 0.8 sends a selected path to the terminal in two ways: **Insert path into
terminal** (Shift+Enter on a focused row) and dragging a row onto a terminal
pane. Both go through the host's `terminal.insertPath.v1` consumer:
`src/main/files-path-insertion.ts`, `src/main/files-terminal-drag.ts` and
`src/preload/files-terminal-drag-bridge.ts`.

- The path is sent as a lexical path with the core's shell quoting and Protected
  Paste. No backend lookup happens and no Enter is added. Mirror Typing stops
  for the delivery.
- The child preload stamps the selection when the request starts. Main and core
  refuse it if the selection changed. Missing or stale stamps fail closed.
- A drop is only accepted over the visible terminal area of the selected tab's
  focused, live pane, which shows a **Drop to insert path (not run)** hint.
  Chrome, other panes, panels, Settings and overlays ignore it.
- The drag carries no path. Main keeps the path and issues a path-free,
  single-use ticket with a ten-second lifetime. Core claims it synchronously at
  drop time. Hide, retirement, window blur or loss and timeout revoke it. Native
  file drags and forged, expired or replayed tickets never fall through to
  ordinary file-drop insertion.
- Paths with control characters (including line breaks and paste delimiters)
  are refused with a notice, not rewritten.
- The captured Surface owns delivery even if the panel closes. Success means the
  live local session accepted every chunk, not that the receiving program read
  it. Partial or unknown outcomes are reported and never retried.
- Focus returns to the terminal only if that pane is still the current target.

## Host composition

`src/main/extension-manager.ts` owns consent, the package store, the runtime and
views. `src/main/application-extensions.ts` wires it into startup, Settings,
the shared action catalog and Quit. Startup opens infrastructure but never
imports installed code.

- Actions pin the exact installed generation and digest. An old action never
  reaches a replacement installation.
- Files opens from the Command Palette, the File menu and the terminal context
  menu. It has no default shortcut; `toggleFiles` in Settings → Shortcuts can bind
  one.
- Files, SSH Connect and Snippets each use one retained companion panel per
  window. Opening again reveals a hidden panel or closes a visible one. Closing
  the panel and reopening creates a fresh view and drops old drafts.
- The panel lives with the window, not the terminal that opened it. Closing that
  terminal keeps the panel; window loss, backend loss and package management
  retire it. Hiding keeps state and never cancels or replays a mutation.
- Panels reserve a 34-DIP core-owned strip at the top.
- The terminal-directory action uses the selected live pane's last local OSC 7
  report at request time. Main confirms the selection with the renderer before
  opening the path. The report can be stale, remote or emitted by any program,
  and the page says so. There is no continuous following.
- The view router keys views by their actual WebContents owner. The child
  preload can only reach its own view; a payload can't pick a backend, window or
  epoch.
- Normal Quit revokes admission, waits up to 15 seconds for extensions to retire
  and records anything unsettled without blocking Quit.

## HTTPS archive installation

In Settings → Extensions, paste an HTTPS archive link and choose **Install from
link** (`src/main/extension-link-install.ts`). After download and validation,
the same native trust dialog as local installation shows the identity, version,
SHA-256 and replacement generation. A digest identifies bytes, not a publisher.
Downloading never activates code.

- Node HTTPS with normal certificate and hostname checks. No browser cookies,
  auth prompts, proxy discovery or content decoding.
- URLs over 8,192 characters, with userinfo, fragments, whitespace, control
  characters or backslashes are refused. Signed query strings are fine.
- Only status 200 supplies an archive. Up to five redirects are followed, each
  rechecked; HTTPS downgrade is refused.
- 60 seconds total, 16 KiB of headers and 64 MiB of body. The usual ZIP and
  manifest limits then apply before trust.
- At most four downloads run across windows, one per window. Closing Settings
  cancels a pending link install. After approval, publication can't be recalled
  and is never retried; use Refresh to inspect the result.
- Errors use fixed localized categories. URLs, query strings and archive content
  stay out of logs.

## Official catalog

**Browse official extensions** fetches the catalog only on explicit Browse or
Refresh. Main picks one endpoint by target:
`distribution/official-extensions-darwin-arm64-v1.json` on macOS ARM64 and
`distribution/official-extensions-v1.json` everywhere else. Both select Files
0.8.0. Downloaded length, SHA-256 and manifest strings must match the entry
before trust. Installation stays dormant until Files is opened.

The schema allows one release per extension ID, so hosts excluded by the
current entry lose the catalog offer and keep local or link installation of an
older archive. [Extension distribution](extension-distribution.md) covers the
catalog contract; [catalog promotion](release.md#catalog-promotion) covers
publishing.

## Build, test and package

Build the archive from a clean committed checkout, after `npm run build`:

```sh
node scripts/build-files-extension.mjs [OUTPUT [FULL_SOURCE_COMMIT [TARGET]]]
```

It needs Python 3 (for the ZIP writer) and the locked esbuild. The default
output is `dist/extensions/files-<version>.omxext`, plus `.sha256` and `.json`
sidecars; none of the three is ever overwritten. The archive includes the MIT
license. For an exported source tree, pass the full commit; the receipt labels
it `supplied-commit`. `TARGET` is `linux-arm64` (default) or `darwin-arm64` and
is only recorded in the receipt. The receipt's `qualification.status: not-run`
is a build-time field; keep test evidence separate. Application packaging never
includes these archives. See [building an extension archive](release.md#building-an-extension-archive).

Tests:

- `npm run test:unit` runs `test/unit/files-*.test.ts`: backend, page, tree,
  toolbar, menus, keyboard workflows, directory moves, path insertion, terminal
  drag and drop, and the catalog entry.
- `OMXTERM_FILES_BUILD=1 npx vitest run test/integration/files-extension-build.test.ts`
  builds a real archive and checks its contents.
- `OMXTERM_TOOLBAR_CHROMIUM=1 npx vitest run test/integration/files-toolbar-browser.test.ts`
  checks toolbar layout, tooltips and menus in headless Chromium.
- `npm run package:verify` loads the packaged addon, runs a no-clobber conflict
  and move, and on macOS checks the trash export and root refusal. It doesn't
  run a real trash or activate Files.

### Packaged Files smoke

`test/integration/files-smoke-packaged.test.ts` qualifies a Files archive on a
published host, on Linux ARM64 and macOS ARM64. It launches the packaged app with
an isolated home and profile, installs the archive through **Settings → Extensions
→ Install local .omxext…** (one consent), lists a directory, and inserts a file
path into the terminal with Shift+Enter. The shell then writes what it received,
and the test compares it with the path. It runs in seconds:

```sh
OMXTERM_FILES_SMOKE_APP=/absolute/OMXTerm-X.Y.Z-arm64.AppImage \
OMXTERM_FILES_SMOKE_ARCHIVE=/absolute/files-X.Y.Z.omxext \
npx vitest run test/integration/files-smoke-packaged.test.ts
```

On macOS, point `OMXTERM_FILES_SMOKE_APP` at an `OMXTerm.app` copied out of the
DMG. Run it from a logged-in desktop session (on Linux, with `DISPLAY` set).
The AppImage is extracted, not modified.

## Platform limits

- Files runs only on Linux ARM64 and macOS ARM64. Windows, Linux x64 and other
  targets have no move addon and no catalog offer.
- Files 0.8.0 passed the packaged smoke on the 0.26.0 Linux and macOS ARM64
  hosts. Native drag onto the terminal is covered by headless tests only.
- Native checks used synthetic Chromium input and controlled consent. They don't
  establish physical keyboard, IME or drag input, native dialogs,
  Gatekeeper/notarization, execution on macOS 12, cancelling a blocked native
  call, or read-only and trash-less volumes.
- Linux trash needs `gio`. Without it, trash fails and nothing is deleted.
- Recursive deletion can stop partway; the result is reported as unknown.
- If Electron main dies while a hosted renderer survives, that renderer is not
  proven unable to read files of a later package version.
