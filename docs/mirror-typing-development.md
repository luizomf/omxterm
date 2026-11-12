# Mirror Typing development

Mirror Typing is an optional extension that copies typing from one pane to a
fixed group of panes in the same tab. It ships as a separate `.omxext` archive.
The [user guide](mirror-typing.md) covers installing and using it.

The extension is only the setup view. Core owns everything that touches input:
the route from one pane's keyboard to the others, the pane marks, and every
stop condition ([ADR 0043](adr/0043-revoke-visible-mirror-typing-routes.md),
[ADR 0050](adr/0050-show-ongoing-states-as-quiet-state-marks.md)).
Extension code never sees keyboard bytes.

## Where the code lives

- `extensions/mirror-typing/extension.json`: id `omxterm.mirror-typing`,
  version, host range, the `terminal.mirrorTyping.v1` and `links.open.v1`
  capabilities and the `docs` link. `"context": "window"` captures the window,
  and core presents the view as a
  [Hosted Dialog](adr/0051-present-short-extension-setup-as-a-hosted-dialog.md)
  over the tab (`src/main/extension-presentation.ts`).
- `extensions/mirror-typing/page.ts`, `view.ts`, `index.html`,
  `mirror-typing.css`: the setup view, the dialog's transparent body. Core
  draws the title and Close. It follows the host theme and interface language
  (`en-US`, `pt-BR`); strings live in `messages.ts`. `backend.ts` does nothing
  on purpose.
- `src/main/mirror-typing-ipc.ts`, `mirror-input-lease.ts`: capture, Start,
  the native input lease and its revocation.
- `src/renderer/mirror-typing.ts`: the renderer group. It reports its pane
  marks and stop notices through the core State Marks in `state-marks.ts`.
- `src/preload/mirror-typing-bridge.ts`, `src/shared/mirror-typing.ts`: the
  typed route between them.

## How it works

1. The **Mirror Typing** action (File menu, terminal context menu, Command
   Palette) captures the selected tab and its focused pane, then opens the
   setup dialog. It refuses unless the focused pane is live and the tab has
   another live pane.
2. The view asks `{operation: "terminal.mirrorTyping.v1", action: "describe"}`
   and gets a one-use setup token plus opaque pane handles, ordinals and titles.
   The focused pane is required. The view renders titles as text.
3. **Start** sends the token and the checked handles (2–16). It only counts
   while the setup dialog is shown. Core hides the dialog, returns to the
   original tab and pane, rechecks them and only then arms the route. The
   hidden view stays alive while mirroring, because losing it stops the group.
   The token is spent even if the reply is lost, so the view never resends it;
   it asks for a fresh setup (Refresh, or opening Mirror Typing again).
4. While armed, the Surface hands each pane's final keyboard bytes to core,
   which writes them once to every member. Paste, snippet Insert/Run and drops
   call the Surface's semantic-input hook first, which stops the group before
   the text goes to the one pane.

Start fires on key release, and only for a press that began on the Start
button. The Enter that ran the palette action and held-key repeats can't start
mirroring, and Start's release can't leak into a pane. The button has focus
when setup is ready, so opening the action and pressing Enter is enough.

## Build and test

Unit tests cover the view, the IPC, the lease, the renderer group and the
setup dialog:

```sh
npx vitest run test/unit/mirror-*.test.ts test/unit/renderer-mirror-typing.test.ts test/unit/hosted-content-dialog.test.ts
```

To build an archive, follow
[Building an extension archive](release.md#building-an-extension-archive) with
`node scripts/build-mirror-typing-extension.mjs`. It writes
`dist/extensions/mirror-typing-<version>.omxext` with `.sha256` and `.json`
sidecars and refuses a dirty checkout. `OMXTERM_MIRROR_TYPING_BUILD=1` also
runs the archive check in `test/unit/mirror-typing-build.test.ts`.

### Packaged Mirror Typing smoke

`test/integration/mirror-typing-smoke-packaged.test.ts` checks an archive on a
packaged host. It installs the archive through **Install local .omxext…**,
splits the tab, finds Mirror Typing in the Command Palette and starts it with
Enter (stray Enter releases and repeats must not start it). Then it checks that
one typed command runs in both shells, and that clicking a pane's mark,
each paste route, a native
file drop and (with a Snippets archive) a snippet Insert leave the next command
in one shell only:

```sh
OMXTERM_MIRROR_SMOKE_APP=/absolute/OMXTerm-X.Y.Z-arm64.AppImage \
OMXTERM_MIRROR_SMOKE_ARCHIVE=/absolute/mirror-typing-X.Y.Z.omxext \
OMXTERM_MIRROR_SMOKE_SNIPPETS=/absolute/snippets-X.Y.Z.omxext \
npx vitest run test/integration/mirror-typing-smoke-packaged.test.ts
```

On macOS, point the app variable at an `OMXTerm.app` copied out of the DMG. On
Windows, point it at the installed `OMXTerm.exe`; the shells are PowerShell
instead of `/bin/sh`. Run it from a logged-in desktop session (on Windows, an
SSH session isn't one: start it through a scheduled task in the console
session). It opens real windows and writes the clipboard, so use a test
machine. The test skips when either required variable is unset.

### Publishing

Follow [Publishing an extension archive](release.md#publishing-an-extension-archive).
Published archives are immutable, so changed bytes need a new version in
`extension.json`.

## Limits

- Typing only: per-pane encoding and multi-pane paste would need a different
  contract.
- Bytes follow the source pane's terminal modes, so mismatched programs can read
  them differently.
- Writes to several PTYs aren't atomic. A failed write stops the group with a
  notice; nothing is retried or rolled back.
- Nothing is saved or restored, and Saved Layout doesn't include it.

## Credits

The workflow adapts the broadcast-input proposal by Rafael Ruscher (@ruscher)
in PR #622, with attribution to Community Big and BigLinux. AshyTerm's MIT
notice ships in `extensions/mirror-typing/licenses/ashyterm.txt`; see
`extensions/mirror-typing/NOTICE`.
