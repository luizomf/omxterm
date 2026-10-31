# Windows ARM64 extension composition from source

Windows ARM64 source admits production extension management and builds the
app-owned backend runtime and lease addon with the ordinary application build.
Startup, installation and enablement remain dormant; explicit shared actions
activate trusted installed code. Windows retains built-in Snippets and its
starter kit. Windows x64 remains outside this admission. The separate Files
move primitive remains unsupported on Windows, with no overwrite fallback.

A bounded ordinary-user, source-launched Windows ARM64 composition checkpoint
passed with the limits below. It does not establish compatibility of existing
published archives, a Snippets cutover, Windows x64, packaged-addon/installer
inclusion, public catalog consumption, physical input, or full portable
qualification. Existing released hosts and archives are unchanged.

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

## Evidence boundary

On source `14464ba9efdda47670b8bc2fe482a5a6d4ae9e85`
(`0.24.0-dev.31`), an assigned Windows ARM64 guest passed the ordinary build and
one opt-in production composition test. The actual account was non-elevated in
the active console session; an input desktop, foreground synthetic F6 and a
WebGL2 context were observed. Node was native ARM64 `26.12.1`; the backend
runtime used Electron `43.8.1`. The corrected preparation also passed the full
10-case simulated build matrix, 135 focused tests, 29 native Installed Packages
tests and one native backend-runtime test, without skips.

All five fixture checks and two exact-digest consents passed: built-in Snippets,
dormant installation, explicit hosted/backend activation and editing,
disable/uninstall with the same Surface and ConPTY, and `app.quit()` with a
second backend active. The controlled ConPTY line probe received its expected
ACK. Both backends recorded exit code zero and child close; the PTY recorded
`onExit`, and its captured identity and both backend creation identities were
absent at Quit. The PTY observer did not export a separate close-event receipt.
The Electron launcher recorded exit/close and both pipe EOFs; the native owner
reported no cleanup errors. The test archive SHA-256 was
`3468705b26b344ed404bd8af34ddd492f1ee10fc5ef89601af2674b8d018b609`.
Source and 16 runtime/build artifacts matched before and after; a subsequent
bounded identity snapshot found all 29 recorded owner identities absent. The
MSVC `.lib`/`.exp` intermediates remained in the native output, not the source
root. The Windows packaging `dist/**` glob could include them; actual installer
contents and addon unpacking remain separate checks.

The actual hosted capture visibly shows an input, caret and focus outline; the
separate core capture shows application chrome, tabs and Close. Fixture heading
and output text were not readable in the black hosted region. The minimal HTML
is unstyled; neither a cause nor a product visual defect is established. The
captures do not qualify full text/theme, terminal pixels or compositor freshness.
Functional ConPTY claims come from the fixture assertions, not the images.

Captured Electron stderr included one `extension-view:present` rejection:
`Unknown hosted content`. Its triggering request, cause and broader impact are
unknown; the existing [#746 investigation](https://github.com/luizomf/omxterm/issues/746)
remains open. npm deprecation/install-script-approval warnings, an SSH key-exchange
warning and PowerShell progress diagnostics were retained separately. A passing
fixture does not establish that these diagnostics are harmless in all contexts.

This was synthetic Chromium input and controlled consent in one assigned guest,
not physical input, physical Quit UI, hardware/default GPU or broad Windows
qualification. Earlier elevated Windows store/runtime passes retain their older
source and elevation limits. The preceding `5acf0be` prepare failed its POSIX
path fixture and remains a failure; the corrected `14464ba` run is separate.
No release, catalog, installed Snippets migration or package qualification follows.
