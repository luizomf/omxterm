# Saved Layout development

Saved Layout is an optional extension (`omxterm.restoration`) that saves one
window's terminal tabs, splits, focus and pane folders, and later opens them in
a new window with fresh Default Shells. It ships as a separate `.omxext`
archive. The [user guide](saved-layout.md) covers installing and using it;
[ADR 0042](adr/0042-save-layouts-without-restoring-sessions.md) records why it
restores structure and never sessions.

## Where the code lives

- `extensions/restoration/extension.json`: id, version, host range, the
  `terminal.captureLayout.v1`, `terminal.openLayout.v1`, `state.v1` and
  `links.open.v1` capabilities, the `docs` link and the window-context view.
- `extensions/restoration/page.ts`, `ui.ts`, `messages.ts`, `restoration.css`:
  the page. It follows the host theme and interface language (`en-US`,
  `pt-BR`).
- `extensions/restoration/open-gesture.ts`: keyboard Open waits for the Enter
  release, so the key can't leak into the new window.
- `extensions/restoration/backend.ts`, `document.ts`: reads and replaces the one
  saved document through `state.v1`.
- `src/shared/terminal-layout.ts`: the layout format and its validation.
- `src/main/terminal-layout-ipc.ts`, `terminal-layout-transfer.ts`,
  `terminal-working-directories.ts`, `application-extension-views.ts`: capture,
  folder provenance, and opening the new window.
- `src/extension-runtime/state.ts`: the `state.v1` adapter.

## How it works

**Save.** The page asks core to capture the window it was opened from. The
renderer sends the tab order, the flat split tree with weights, the focused pane
and the selected tab; main replaces each session with a folder:

- `reported-local`: the pane's last local OSC 7 report;
- `launch-local`: the folder the Default Shell started in, when the shell never
  reported one;
- `home`: SSH Connect and `-e` panes, ended or pending panes, and panes whose
  last report was remote or invalid.

Settings and extension tabs are left out and counted. Limits are 16 tabs, 16
panes per tab, 32 panes and 256 KiB; a larger window is refused, never
truncated. The backend writes the document with `state.v1`.

**Open.** The page sends the saved document back. Main checks it, refuses one
saved on another OS, checks each folder (two at a time, 1.5 s each) and uses
home for missing ones. Then it creates one new window that owns every pane from
the start: no default tab, no repeated split commands. Each pane gets a
single-use token that carries its folder in main; the renderer never sees the
paths. Every pane starts the Default Shell normally, including background tabs.
Core reports how many folders fell back.

After Open, the new window belongs to core. Disabling or removing the extension
doesn't touch it.

**Storage.** `state.v1` keeps one JSON document per extension at
`<profile>/extension-state/omxterm.restoration/state.json`, outside the user
configuration and the installed archives. Each write takes a short native lease,
compares the expected revision and renames a complete temp file into place.
Forget writes an empty document with a new revision. A write that conflicts or
whose outcome is unknown is never retried: the page reads the saved state again
and shows it. Reads never repair or migrate a file; an unreadable one shows
**Try again**.

## Build and test

Unit tests cover the layout format, capture and folder provenance, the transfer,
the state adapter, the backend and the page:

```sh
npx vitest run test/unit/restoration-*.test.ts test/unit/terminal-layout-*.test.ts test/unit/extension-state.test.ts
```

To build an archive, follow
[Building an extension archive](release.md#building-an-extension-archive) with
`npm run build:restoration-extension`. It writes
`dist/extensions/restoration-<version>.omxext` with `.sha256` and `.json`
sidecars and refuses a dirty checkout. To try it, install the archive through
**Settings → Extensions → Install local .omxext…**.

### Packaged Saved Layout smoke

`test/integration/restoration-smoke-packaged.test.ts` checks an archive on a
packaged host, on macOS, Linux and Windows. It installs the archive, reports a
folder with OSC 7 from the Default Shell, adds a tab and a split, and saves.
Then it quits, starts the app again, opens the saved layout and asks the
restored shell where it started. It runs in seconds:

```sh
OMXTERM_RESTORATION_SMOKE_APP=/absolute/OMXTerm-X.Y.Z-arm64.AppImage \
OMXTERM_RESTORATION_SMOKE_ARCHIVE=/absolute/restoration-X.Y.Z.omxext \
npx vitest run test/integration/restoration-smoke-packaged.test.ts
```

On macOS, point the app variable at an `OMXTerm.app` copied out of the DMG; on
Windows, at the installed `OMXTerm.exe`. Run it from a logged-in desktop
session. The test skips when either variable is unset.

### Publishing

Follow [Publishing an extension archive](release.md#publishing-an-extension-archive).
Published archives are immutable, so changed bytes need a new version in
`extension.json`.

## Current limits

- Folders come only from OSC 7 reports and launch folders. OMXTerm never
  inspects a process's working directory or adds shell integration
  ([ADR 0013](adr/0013-do-not-inject-shell-integration.md)); most shells need a
  few lines of setup, shown in the user guide.
- One saved layout for one window. Opening is always explicit.
- Windows x64 hosts don't run extensions.

## Credits

The layout validation adapts pane coverage and indexing ideas from @ruscher's
#622. The archive keeps MIT licensing and the acknowledgement in
`extensions/restoration/NOTICE`.
