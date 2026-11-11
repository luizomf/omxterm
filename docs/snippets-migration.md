# Snippets extension

Snippets is an optional extension (`omxterm.snippets`) on most hosts. Its source
lives in `extensions/snippets/`. It reads the user's `snippets.yaml`, lists and
searches entries, and asks the core to insert or run the exact text in the
selected terminal. [ADR 0044](adr/0044-migrate-snippets-without-changing-terminal-input.md)
records why it moved out of the core. The user-facing summary is the
[Snippets availability note](snippets-availability.md).

## Which hosts use the extension

`usesOptionalSnippets()` in `src/shared/snippets-mode.ts` is the single platform
policy:

| Host                                               | Snippets           |
| -------------------------------------------------- | ------------------ |
| Linux ARM64, Linux x64, macOS ARM64, Windows ARM64 | Optional extension |
| Windows x64                                        | Built-in sidebar   |
| Any platform on stable 0.23.0 and earlier          | Built-in sidebar   |

On extension hosts, an install or runtime failure never falls back to the
built-in sidebar. Fresh configuration kits on those hosts omit the starter
`snippets.yaml`; Windows x64 still creates it. Windows x64 has no extension
management at all.

New packaged profiles on extension hosts get Snippets 0.1.0 installed once,
enabled but inactive until opened. See [Default Snippets](default-snippets.md).
Existing profiles never get it automatically.

## How it works

The package has a trusted Node backend (`backend.ts`, `catalog.ts`) and an
isolated hosted page (`page.ts`, `view.ts`). It runs in the shared companion
panel next to Files and SSH Connect.

- **Catalog loading.** The backend reads `snippets.yaml` on every panel
  activation, not at startup and not through a watcher. It sends one immutable
  snapshot to the page in bounded pages (up to 512 entries), and the page
  replaces its rows only once the snapshot is complete. A hidden or superseded
  activation cannot publish late results.
- **View state.** Hiding keeps query and scroll. A language change relabels the
  controls without rebuilding them.
- **Terminal delivery.** The page never touches the PTY. It sends exact text to
  the core, which owns the target, preview and paste. See
  [Terminal-input rules](#terminal-input-rules).

## Catalog file and shortcuts

`snippets.yaml` lives beside `config.json` and uses the
[documented YAML v1 format](configuration.md#snippets). Install, update,
disable and uninstall never create, copy, rewrite or delete it. A missing file
is a clean empty state. To start a catalog, copy `snippets.example.yaml` from
the package. That example uses POSIX `printf`; Windows users need commands for
their own shell.

Which home directory the extension uses depends on its version:

- **0.1.1 (catalog):** a nonempty `XDG_CONFIG_HOME` wins; otherwise the OS
  account home, independent of `HOME` or `USERPROFILE`.
- **0.1.0 (bundled default and older installs):** a nonempty `XDG_CONFIG_HOME`
  wins; otherwise the environment's `HOME` (`USERPROFILE` on Windows). If that
  differs from the account home, 0.1.0 reads a different file from the one
  beside `config.json`. Updating to 0.1.1 fixes it. Upgrading the app does not
  update an installed 0.1.0.

**View → Toggle Snippets**, its Command Palette entry and its shortcut
(`Ctrl+Shift+S` on Linux/Windows, `Cmd+Shift+S` on macOS, `keybinds.toggleSnippets`)
are the only entry point. The package's own duplicate action is withheld.

- With Snippets installed and enabled, the command opens the companion view.
  Invoking it again while Snippets is the visible tool **closes** it and drops
  its search and scroll. **Hide** or Escape keeps that state for reopening.
- Without an enabled package, it opens **Settings → Extensions** with an
  explanation. A disabled package stays disabled. Nothing is installed or
  enabled for the user. An unavailable extension runtime is reported
  separately from a missing package.
- On Windows x64, it opens the built-in sidebar.
- Custom remaps and `null` bindings keep working whether or not the package is
  installed.

### Empty-panel access

**Toggle Auxiliary Panel** hides and reveals the panel as usual whenever any
tool is open. When the panel is genuinely empty, it opens installed and enabled
Snippets instead. Windows x64 opens its built-in sidebar.

If Snippets is not available, the panel shows one nonmodal notice for about four
seconds, once per application process across all windows. It does not steal
focus, open Settings, install, enable or download anything. A late view cannot
open after the selection, modal or focus has moved on.

## Terminal-input rules

These rules come from ADR 0044. They keep the terminal's input guarantees the
same as with the built-in sidebar.

- **One narrow capability.** The package declares `terminal.semanticInput.v1`.
  A request carries exact `text`, a `title`, an optional `description`, an
  `intent` (`insert` or `run`) and a boolean `preview`. It cannot name a target
  terminal, get a PTY handle, read terminal output or inject raw keys.
- **Core picks the target.** Core captures the selected live Surface before any
  asynchronous work, and every later step uses that capture. If the selection
  changes in transit, or the target fails or closes, delivery is refused, even
  if a replacement pane appears. With no live target, the request does nothing.
- **Sender checks.** Core rejects requests from stale, hidden or foreign views
  and from a retired installation.
- **Core-owned preview.** The preview is the core's dialog, not an extension
  modal. Its body is literal and read-only, with localized Insert, Run and
  Cancel. The final button overrides the row's default intent. Only one
  acceptance is possible. Cancel returns focus to the initiating control, then
  the panel search, then the terminal.
- **Exact text.** Text is never expanded, normalized or truncated.
  `execute: false` adds no final Enter, but embedded line breaks or control
  characters can still execute. Protected Paste stays core-owned.
- **Gesture ownership.** A row's Enter press, its repeats and its release never
  leak into the terminal after focus moves, including with Kitty keyboard
  reporting.
- **Retirement.** Disable, update or uninstall cancels unaccepted previews and
  pending requests. It does not end terminal sessions or undo commands already
  sent. Input a Surface already accepted stays with that Surface.

## Build and test

The builder needs a clean committed checkout and runs after `npm run build`
(which clears `dist`):

```sh
npm run build
node scripts/build-snippets-extension.mjs            # writes dist/extensions
OMXTERM_SNIPPETS_BUILD=1 npm test -- test/integration/snippets-extension-build.test.ts
```

The builder accepts `[OUTPUT [SOURCE_COMMIT]]`. It writes the `.omxext` archive
and its `.sha256` and `.json` receipt; the receipt's
`qualification.status: not-run` is a build-time field. Version, host range, API
and capabilities come from `extensions/snippets/extension.json`. See
[Building an extension archive](release.md#building-an-extension-archive) for
the shared rules.

`npm run test:unit` covers the package and its host seam, including
`test/unit/snippets-extension-*.test.ts`, `snippets-mode.test.ts`,
`renderer-snippet*.test.ts` and `default-snippets-*.test.ts`. The opt-in
production-composition fixture checks the missing-package guidance on each
extension host; see the [macOS](macos-extension-composition.md),
[Linux x64](linux-x64-extension-composition.md) and
[Windows ARM64](windows-arm64-extension-composition.md) notes.

### Packaged Snippets smoke

`test/integration/snippets-smoke-packaged.test.ts` checks an archive on a
packaged host, on Linux ARM64 and macOS ARM64. It launches the app with an
isolated home that has a two-entry `snippets.yaml`, installs the archive through
**Install local .omxext…** (one consent), opens **Toggle Snippets**, then
Inserts one entry and Runs the other. The shell writes what it received, and the
test checks it and that `snippets.yaml` is unchanged. It runs in seconds:

```sh
OMXTERM_SNIPPETS_SMOKE_APP=/absolute/OMXTerm-X.Y.Z-arm64.AppImage \
OMXTERM_SNIPPETS_SMOKE_ARCHIVE=/absolute/snippets-X.Y.Z.omxext \
npx vitest run test/integration/snippets-smoke-packaged.test.ts
```

On macOS, point the app variable at an `OMXTerm.app` copied out of the DMG and
run it from a logged-in desktop session. The test skips on Windows and when
either variable is unset.

## Publish and install

Snippets ships as its own `ext-snippets-vX.Y.Z` prerelease. Follow
[Publishing an extension archive](release.md#publishing-an-extension-archive),
then [Catalog promotion](release.md#catalog-promotion). The Snippets entry is
edited by hand in both `distribution/official-extensions-v1.json` (every host
except macOS) and `distribution/official-extensions-darwin-arm64-v1.json`
(macOS), with targets `linux-arm64`, `linux-x64`, `darwin-arm64` and
`win32-arm64`. The bundled default is a separate pinned archive; changing the
catalog entry does not change it ([Default Snippets](default-snippets.md)).

Users install or update in one of two ways. Both use the same captured-byte
trust prompt:

1. **Settings → Extensions → Browse official extensions**, then Install or
   Update on the Snippets card. Browsing is explicit; opening Settings does not
   fetch the catalog.
2. **Settings → Extensions → Install local .omxext…** with an archive
   downloaded from the [release](https://github.com/luizomf/omxterm/releases/tag/ext-snippets-v0.1.1).
   This works offline once downloaded. Verify it first:

   ```sh
   shasum -a 256 -c snippets-0.1.1.omxext.sha256      # macOS
   sha256sum --check snippets-0.1.1.omxext.sha256     # Linux
   ```

   On Windows, compare `Get-FileHash .\snippets-0.1.1.omxext -Algorithm SHA256`
   with the sidecar. A checksum identifies bytes, not a verified publisher.

Approving the install enables the package but does not start its backend.
Toggle Snippets is the activation step. Extension code is trusted code, not a
sandbox.

## Known limits

- **Windows ARM64:** installing Snippets from the public catalog failed in
  testing when the controlled terminal child exited unexpectedly, and the cause
  is unknown. Users who need Snippets there can stay on [0.23.0](https://github.com/luizomf/omxterm/releases/tag/v0.23.0),
  which has it built in.
- **Windows network silence:** startup is not verified to stay network-silent
  on Windows; the strict test sees system-proxy discovery traffic. No Snippets
  catalog or archive download was observed.
- **x64 packages:** Linux x64 and Windows x64 packages are build-only in CI;
  their desktop integration is untested.
