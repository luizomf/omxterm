# Windows ARM64 extension composition from source

Windows ARM64 source admits production extension management and builds the
app-owned backend runtime and lease addon with the ordinary application build.
Startup, installation and enablement remain dormant; explicit shared actions
activate trusted installed code. Windows retains built-in Snippets and its
starter kit. Windows x64 remains outside this admission. The separate Files
move primitive remains unsupported on Windows, with no overwrite fallback.

A bounded ordinary-user, source-launched Windows ARM64 composition checkpoint
passed with the limits below. A separate [packaged runtime checkpoint](#packaged-runtime-checkpoint)
inspected one exact unpacked ARM64 app directory, followed by a separate
[packaged-GUI composition checkpoint](#packaged-gui-composition-checkpoint)
using that retained directory. These do not establish compatibility of existing
published archives, a Snippets cutover, Windows x64, installer behavior, public
catalog consumption, physical input or full portable qualification. Existing
releases are unchanged.

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
root. This source checkpoint alone did not inspect a package or installer.

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
No release, catalog, installed Snippets migration or package result follows
from that source test alone.

## Packaged runtime checkpoint

🤖 AI-assisted.

A separate non-elevated Interactive/Limited Windows ARM64 task built and
inspected an unpacked app directory from exact source
`7f9fde17b6e966fec07bed5e168cc99d086ec15e` (`0.24.0-dev.32`). This is not
the earlier `14464ba` source-launched GUI fixture. The package task verified
1,280 source entries before and after, completed the ordinary native build and
passed 113 focused tests across ten files without skips. Native ARM64 Node was
`26.12.1`; the packaged Electron was `43.8.1` with Node `24.22.0`.

The inspection compared the prepared extension runtime and packaged bytes,
verified ARM64 PE architecture and the lease addon's explicit ASAR unpacking,
and found no `.lib`, `.exp` or `.obj` files in the ASAR or output tree. The
ASAR SHA-256 was
`1f15ef5df6787d35c8726148045fcaf14fe54a63cc971c19f7cd9d4adc7a5a65`;
the unpacked `extension-leases.node` SHA-256 was
`92a10ac42bc6947c70c55df3cae0896bc2c54dfe712264dcd7d4f0ceecf3899f`.
The staged app executable SHA-256 was
`8ae41dba589a59490e569317efd20c1db1657c5535c042eabf2eee1404cbb431`.
The packaged Electron in Node mode acquired and released a native lease,
opened an empty Installed Packages store, resolved the bootstrap to its
missing-IPC refusal and loaded the packaged node-pty addon. This did not
activate an installed extension or create a ConPTY session.

All nine direct task steps recorded exit, close and both stream EOFs. A later
snapshot found the runner and nine recorded step PIDs absent; the task did not
record their creation identities or census arbitrary descendants. npm
reported deprecation and install-script-approval warnings; the controlled
installer-transaction unit tests printed four replacement warnings without
running NSIS. An SSH key-exchange warning and legacy-encoded PowerShell progress
were retained. The previous `695f560` package attempt failed three focused
ASAR-path tests and remains a failed attempt; the later corrected run is separate.

This inspection did not launch the packaged GUI, build or execute an NSIS
installer, publish an artifact or catalog, migrate Snippets, admit the Windows
Files move addon, or qualify Windows x64 or full portable behavior. The separate
source-composition result and this inspection alone do not establish packaged
GUI composition; the following checkpoint exercised the retained package.

## Packaged-GUI composition checkpoint

🤖 AI-assisted.

A separate Interactive/Limited Windows ARM64 task passed a bounded GUI
composition checkpoint using the retained unpacked app built from
`7f9fde17b6e966fec07bed5e168cc99d086ec15e` (`0.24.0-dev.32`); it did not
rebuild the package. Its fixture source was
`099d3444c0f80124989fbe3388fa0d066107db78`, with a separately frozen private
adapted scenario and observer: the executed fixture was **not byte-identical**
to the tracked source fixture. Complete before/after inventories matched the
previously inspected 110 entries, including 97 files and the executable, ASAR
and lease-addon hashes above. The minimal local extension archive had SHA-256
`3468705b26b344ed404bd8af34ddd492f1ee10fc5ef89601af2674b8d018b609`.

Preflight observed a non-elevated user in the active console, an available input
desktop, synthetic F6 with owned foreground, and native ARM64 Node `26.12.1`.
The packaged renderer created WebGL2; the attached application reported
Electron `43.8.1` and Node `24.22.0`. Resolved userData and temporary paths
were inside the private fixture root when checked **after** startup; this does
not prove the absence of earlier side effects. The initial PTY working directory
remained the guest account's OS home. The fixture used a controlled Node REPL,
not the account shell or its profile.

Four named scenario checks covered built-in Snippets without activation,
installation and enablement remaining dormant, explicit hosted/backend
activation with editing, and disable/uninstall while retaining the same selected
Surface and observed ConPTY. The private adapter bound that Surface to the
second PTY through probe input and readiness, and the retained PTY returned the
expected ACK. Two controlled approvals checked the exact archive digest. A
separate fifth witness recorded the expected second backend's matching
PID/creation identity and observed child state (`closed: false`, `exit: null`)
in the same synchronous main-process callback that then invoked `app.quit()`.
The witness was written before that call, without returning to the event loop;
normal Quit join was verified separately. This is an OS process snapshot and
observed child state, **not atomic OS liveness**: the backend could exit after
the snapshot, and an exit callback could be pending while the main thread was
blocked.

The observed PTY reported `onExit`, and both backend children reported exit
code zero and child close. Four captured PTY/backend creation identities were
absent at Quit; no separate PTY close-event receipt was exported. The packaged
main recorded exit and close, both stream EOFs and no truncation or capture
error. The native supervisor reported the driver exit and no cleanup errors. A
later read-only snapshot found all 92 recorded owner/driver/PTY/backend
creation identities absent; it was not an arbitrary-descendant census.

An earlier, separately frozen packaged-GUI run on this retained package recorded
four named checks and joined Quit, but its backend-liveness assertion preceded
the Quit callback and did not supply the new witness. That earlier result
remains partial for the Quit-request observation; this later run does not rewrite
it.

The actual hosted capture visibly shows the edited input, caret and focus
outline; its heading and output were not readable in the black region. The
separate core capture shows application chrome, two terminal tabs, the selected
fixture tab and Close, but does not establish terminal pixel rendering while the
fixture is selected. The minimal fixture HTML is unstyled; neither a cause nor
a product visual defect is established. The captures do not qualify full text
readability, theme, compositor freshness, physical input or a default hardware
GPU. Surface/ConPTY and shutdown claims rest on the functional receipts.

Packaged stdout contained two bytes and stderr contained 211 bytes of debugger
listening, attachment and disconnect messages. The earlier `Unknown hosted
content` rejection was not observed in this captured stderr; this does not
resolve [#746](https://github.com/luizomf/omxterm/issues/746). The SSH
key-exchange warning and legacy-encoded PowerShell progress remain separate
transport diagnostics. This checkpoint does not execute NSIS or qualify an
installer, Windows x64, Files, public catalog consumption, Snippets migration or
full portable behavior. Exact installer verification remains a separate task
subject to the [disposable-VM and recovery requirements](release.md#windows-arm64-and-x64).
