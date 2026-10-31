# Windows ARM64 extension composition from source

Windows ARM64 source admits production extension management and builds the
app-owned backend runtime and lease addon with the ordinary application build.
Startup, installation and enablement remain dormant; explicit shared actions
activate trusted installed code. Windows retains built-in Snippets and its
starter kit. Windows x64 remains outside this admission. The separate Files
move primitive remains unsupported on Windows, with no overwrite fallback.

This source change is **not yet Windows native-composition qualification**.
It does not establish Windows archive compatibility, a Snippets cutover,
Windows x64, packaged-addon/installer inclusion, public catalog consumption,
physical input, or full portable qualification. Existing released hosts and
archives are unchanged.

## Installed-package production fixture

Use a fresh isolated Windows ARM64 checkout and an unlocked, idle interactive
desktop under the ordinary, non-elevated user. Follow the
[Windows prerequisites](development.md#windows), including native ARM64 Node,
MSVC/SDK, a verified ARM64 Node import library and ordinary-user symlink access.
Confirm actual WebGL2 and foreground input availability in that session; a
headless SSH token or an earlier desktop snapshot is not sufficient. Do not run
graphical suites concurrently or on another user's working desktop.

After `npm ci` and an ordinary build, in the initialized developer shell:

```powershell
npm.cmd run build
$env:OMXTERM_EXTENSION_COMPOSITION = '1'
$env:OMXTERM_EXTENSION_COMPOSITION_EVIDENCE = 'C:\absolute\private\fresh-evidence'
npm.cmd test -- test/integration/extension-production-composition.test.ts
```

The fixture imports `dist/main/index.js` unchanged and uses a real, minimal
local archive. Its controlled consent binds the exact digest. It checks built-in
Snippets without extension activation; dormant install/enable; explicit backend
and hosted-view activation; isolated editing; disable/uninstall while retaining
the same Surface and ConPTY; and a second active backend during `app.quit()`.
A controlled Node line/ACK probe runs inside the real ConPTY. The observer waits
for the asynchronous PID, captures OS process creation identities and checks
the same PTY identity after retirement. Normal Quit requires actual PTY exit,
backend exit and close, and absence of all captured PTY/backend identities.
On Windows an owned launcher also joins the actual Electron process, stdout and
stderr EOF, and rejects output truncation. The outer native-fixture supervisor
owns its disposable profile and descendant cleanup. An unresolved cleanup or
missing receipt is not a pass and must be inspected before another run.

This is synthetic Chromium input and controlled consent, not hardware input or
native-dialog interaction. `app.quit()` exercises application shutdown, not the
physical Windows Quit menu or shortcut. Inspect actual captures separately;
WebContents captures are not proof of compositor freshness. Preserve failures,
stderr and exact source/build/runtime/architecture identities. The opt-in test
is skipped by default; a skip is never native evidence.
