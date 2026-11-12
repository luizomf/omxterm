# Windows ARM64 extension composition

Windows ARM64 runs production extension management, backend activation and
hosted views through the same owners as Linux and macOS. Startup, installation
and enablement stay dormant. Explicit shared actions activate trusted installed
code. Disable, uninstall and normal Quit join the owned backend and view
retirement. An extension infrastructure failure never blocks terminal startup.

Windows ARM64 uses the optional [Snippets extension](snippets-migration.md).

## What differs on Windows

- **Build.** The ordinary `npm run build` builds the backend runtime and the
  native lease addon (`extension-leases.node`). It needs native ARM64 Node,
  MSVC and the Windows SDK, an ARM64 Node import library and ordinary-user
  symlink access; see [Windows prerequisites](../development.md#windows). The MSVC
  `.lib` and `.exp` files are build intermediates and stay in the native output
  directory.
- **Files move and trash.** From 0.28.0, `files-move.node` is built on Windows
  too: `MoveFileExW` without replace, and Recycle Bin trash that refuses rather
  than deleting permanently. Earlier hosts refuse Files moves as unsupported.
- **Windows x64.** From 0.28.0, x64 admits extension management like ARM64 but
  keeps built-in Snippets.

## Packaging and verification

Packaging unpacks `extension-leases.node` from the ASAR and leaves out the
`.lib`, `.exp` and `.obj` intermediates. Package verification checks the
bundled runtime bytes, PE architecture and unpacking, then runs the packaged
Electron in Node mode: it acquires and releases a lease, opens an empty
Installed Packages store and resolves the bootstrap to its missing-IPC refusal.
That probe does not activate an extension or open a ConPTY.

Use `npm run package:verify -- --windows-unpacked-only` for the unpacked app,
or the full `npm run check:win` flow for the NSIS installer. Full NSIS
verification installs and uninstalls the real package, so run it only in a
disposable VM; see [Windows ARM64 and x64](../release.md#windows-arm64-and-x64).

## Installed-package production fixture

Use a fresh Windows ARM64 checkout on an unlocked, idle interactive desktop,
signed in as an ordinary non-elevated user. The session needs working WebGL2
and foreground input; a headless SSH session is not enough. Don't run graphical
suites concurrently or on someone's working desktop.

In the initialized developer shell:

```powershell
npm.cmd run build
$env:OMXTERM_EXTENSION_COMPOSITION = '1'
$env:OMXTERM_EXTENSION_COMPOSITION_EVIDENCE = 'C:\absolute\private\fresh-evidence'
npm.cmd test -- test/integration/extension-production-composition.test.ts
```

This is the same fixture as on [macOS](macos-extension-composition.md) and
[Linux x64](linux-x64-extension-composition.md). It imports `dist/main/index.js`
unchanged and installs a real minimal archive from
`test/fixtures/extension-composition-package.ts` through controlled consent
bound to the exact digest. It checks:

- the missing-Snippets guidance opens without activating anything;
- installation and enablement stay dormant;
- explicit activation starts the backend and hosted view, and editing in the
  view stays isolated from the terminal;
- disable and uninstall keep the same Surface and ConPTY usable;
- `app.quit()` with a second backend active joins the PTY exit, both backend
  exits and closes, and leaves none of the captured process identities running.

Two pieces are Windows-specific. The terminal runs a controlled Node line/ACK
probe (`test/fixtures/extension-composition-probe.cjs`) instead of `/bin/sh`.
An owned launcher (`test/fixtures/extension-composition-launch.cjs`) starts
Electron, joins its exit and both stdout and stderr EOFs, and rejects
truncated output.

The fixture uses synthetic Chromium input and controlled consent. `app.quit()`
exercises application shutdown, not the Quit menu or shortcut. WebContents
captures in the evidence directory don't prove compositor freshness. The test
is skipped by default, and a skip is never a native pass. An unresolved cleanup
or missing receipt is a failure; inspect it before running again.
