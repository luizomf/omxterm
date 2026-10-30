# Native development reference

Start with [Contributing](../CONTRIBUTING.md#development-environment) to clone the repository, install dependencies, and run OMXTerm in development mode. This guide covers OS-specific prerequisites, running unit and graphical integration tests, and verifying native packages.

See the [Restty guide](restty-development.md) for Terminal Surface internals and [release procedures](release.md) for full release builds.

## Platform prerequisites

Development targets native ARM64 macOS and ARM64/x64 Linux and Windows with **Node.js 22.13+ (22.x) or 24+** and npm. When working inside a virtual machine, clone and build on the guest's native filesystem rather than a shared host folder.

### macOS

Install **Xcode Command Line Tools** (`xcode-select --install`) before running `npm ci`.

- `postinstall` compiles the pinned Unix `node-pty` native addon.
- `npm run build` compiles `native/macos-window-blur.mm` using bundled Node-API headers (targeting macOS 12.0+).

### Linux

Install C++ build tools, Python 3, `patch`, `binutils`, `procps`, `fontconfig`, `file`, XWayland, and the required test fixture fonts (`DejaVu Sans`, `DejaVu Sans Mono`, and `Liberation Mono`):

```sh
# Ubuntu / Debian
sudo apt install build-essential python3 patch binutils procps fontconfig file xwayland xdotool fonts-dejavu-core fonts-liberation

# Fedora
sudo dnf install gcc-c++ make python3 patch binutils procps-ng fontconfig file xorg-x11-server-Xwayland xdotool dejavu-sans-fonts dejavu-sans-mono-fonts liberation-mono-fonts

# Arch / Omarchy
sudo pacman -S --needed base-devel python patch binutils procps-ng fontconfig file xorg-xwayland xdotool ttf-dejavu ttf-liberation
```

`npm ci` rebuilds the source-digest-guarded exec-status PTY addon on native Linux
ARM64 and x64; use C++ build tools and `patch` on both architectures.
Full Linux package startup verification also requires Python 3.9+ and Linux
pidfd support (kernel 5.3+); identity-checked signaling fails closed without them.
A positive PID can disappear between the kernel's lookup and pidfd preparation;
older kernels can return `EINVAL` at that boundary. The helper accepts that
acquisition result only when a subsequent `/proc/<pid>/stat` read proves the
process disappeared. Existing/reused or unreadable identities, other errors,
and `EINVAL` from signaling remain failures; no PID-only signal fallback is used.

Verify that the fixture fonts are installed with `fc-list : family` (missing fixture fonts cause native font integration tests to fail with `Configured native fixture font is missing`).

If `npm ci` failed part-way because a system tool like `patch` or `make` was missing, install the missing package and run:

```sh
npm run postinstall && npm run check:portable
```

OMXTerm runs with `--no-sandbox` on Linux ([ADR 0024](adr/0024-disable-the-chromium-sandbox-on-linux.md)) and uses X11/XWayland. `npm run dev` passes `--no-sandbox` automatically; if launching Electron directly for debugging, run `npx electron --no-sandbox .`.

#### Executable temporary directory for Linux tests

Linux tests need a writable temporary directory on a filesystem that permits execution. These fixtures create executable scripts under Node's `os.tmpdir()` (which honors `TMPDIR`):

- [`linux-appimage-installer`](../test/unit/linux-appimage-installer.test.ts) and [`linux-helper-architecture`](../test/unit/linux-helper-architecture.test.ts) execute synthetic AppImages and commands such as `file` and `uname` through a fixture-local `PATH`.
- [`linux-appimage-launcher`](../test/integration/linux-appimage-launcher.test.ts) runs a generated AppRun through Bash, which then executes the temporary application stub.
- [`linux-desktop-launch`](../test/integration/linux-desktop-launch.test.ts) executes inspection stubs and a synthetic AppImage, including its installed copy through `gio launch`.
- [`linux-helper-provisioning`](../test/integration/linux-helper-provisioning.test.ts), [`linux-installer-lifecycle`](../test/integration/linux-installer-lifecycle.test.ts), and [`linux-packaged-process`](../test/unit/linux-packaged-process.test.ts) execute temporary helper, AppImage, or wrapper scripts.

If `/tmp` is mounted with `noexec`, executable permission bits alone do not satisfy this prerequisite. Failures can look like an invalid AppImage or a helper that never starts, rather than an explicit permission error. See [#688](https://github.com/luizomf/omxterm/issues/688) for the contributor-reported example, not a maintainer reproduction or established architecture defect.

Use a newly created, private directory on an execution-capable filesystem you own. For example, from the repository root, this subshell tries your home filesystem, checks direct script execution, and scopes `TMPDIR` to one focused, non-graphical test run:

```sh
(
  TMPDIR=$(mktemp -d "$HOME/omxterm-test-tmp.XXXXXX") || exit 1
  export TMPDIR
  trap 'rm -f "$TMPDIR/exec-check"; rmdir "$TMPDIR" || printf "%s\n" "Temporary files retained at $TMPDIR; inspect before removing." >&2' 0
  printf '#!/bin/sh\nexit 0\n' > "$TMPDIR/exec-check"
  chmod 700 "$TMPDIR/exec-check"
  "$TMPDIR/exec-check" || {
    printf '%s\n' 'Choose an execution-capable filesystem allowed by your local policy.' >&2
    exit 1
  }
  rm "$TMPDIR/exec-check"
  npm test -- test/unit/linux-appimage-installer.test.ts
)
```

`mktemp -d` creates an owner-only directory; the exit trap removes it only if empty, preserving any remaining fixture files for inspection. Your home filesystem may also prohibit execution: if the probe fails, choose another approved user-owned location rather than remounting `/tmp`, changing system policy, using `sudo`, or skipping failures. For other test commands, use the same scoped environment; full-suite graphical requirements still apply. This prerequisite does not diagnose separate patched-PTY or CJK font failures.

### Windows

1. Enable **Developer Mode** in Windows Settings before cloning or running tests so non-elevated processes can create symbolic links.
2. Clone with `git clone -c core.autocrlf=false -c core.symlinks=true ...` to preserve LF line endings and repository symlinks.
3. Install the Microsoft Visual C++ Redistributable that matches your machine (**ARM64** or **x64**), and C++ build tools if building native addons from source. Without it, `npm ci` fails while loading native modules.
4. Run desktop development and graphical tests as a normal (non-Administrator) user inside an interactive desktop session (not a headless SSH Session 0). The separate hosted build-only lane uses headless checks and does not claim ordinary-user integration.

To verify that your user account can create symlinks before running `npm ci`, run in a non-elevated PowerShell window:

```powershell
@'
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omxterm-symlink-check-'));
try {
  fs.writeFileSync(path.join(root, 'target.txt'), 'ok');
  const link = path.join(root, 'link.txt');
  fs.symlinkSync('target.txt', link, 'file');
  if (fs.readFileSync(link, 'utf8') !== 'ok') throw new Error('Symlink read failed');
  console.log('PASS: ordinary-user file symlink creation');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
'@ | node
```

If PowerShell blocks local npm scripts, start a process-scoped session from your desktop terminal:

```powershell
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned
npm.cmd ci
npm.cmd run check:portable
```

## Pinned PTY runtime

OMXTerm pins the official `node-pty@1.2.0-beta.18` archive, not a floating beta
channel or custom Windows fork. Its npm integrity is
`sha512-3Rej3788OnasAwoSmTZhlCeUraJ9CQldtL5b571b9+3Nv47+PaxA5VPIGOOs+16OYQePTrC1Lrs8a9/df5WPRg==`.
This dependency maintenance incorporates upstream's merged ConPTY synchronization
and readiness corrections; it does not attribute historical crashes or establish
native/package qualification by source inspection alone. Electron stays locked
independently.

Postinstall guards complete input, intermediate and final JavaScript bytes,
applies exact replacements, and rejects unknown or partially modified sources.
It retains literal Windows argv, pause-aware Unix output-tail closure,
unavailable Linux foreground reads, and explicit boolean startup-failure
forwarding. The Windows agent-error handler supplies that boolean for deferred
connection failures; ordinary numeric exits never imply startup failure.

On macOS ARM64 and Linux ARM64/x64, preparation patches a temporary copy of the
pinned Unix sources with zero fuzz, verifies the patched digests, and builds with
C++17, Node-API 8 and locked headers. Installed upstream C++ sources remain
unchanged. macOS targets 12.0 and installs the rebuilt addon and matched executable
spawn helper in both `build/Release` and `prebuilds/darwin-arm64`. Linux installs
the same corrected addon in `build/Release` and the matching Linux prebuild, so
loader fallback cannot lose exec-status reporting even when upstream's install
hook skips compilation.

Windows ARM64/x64 retain unmodified official `conpty.node`,
`conpty_console_list.node`, and sibling `conpty/{conpty.dll,OpenConsole.exe}`
(bundled ConPTY `1.25.260303002`, selected with `useConptyDll: true`). Preparation
checks their archive-derived hashes and rejects any shadowing `build/Release` or
`build/Debug` addon. A DLL-only directory from upstream postinstall is not an
addon shadow. Windows source builds are not a supported fallback for this pin.

Packages exclude foreign prebuilds, Windows `pty.node`/winpty/PDBs and redundant
`third_party` build inputs. Package verification compares prepared JavaScript and
selected native bytes against the exact packaged files. macOS instead records
final native hashes after its required ad-hoc signing and verifies the complete
seal. `.scratch/node-pty-package.json` records selected native/runtime hashes;
inspection-only runtime evidence also carries this provenance. These records
must accompany the source/lock, target and compiler/SDK evidence; Unix compiler
outputs are not claimed bit-for-bit reproducible across toolchains. Prepared
JavaScript identities are listed in the [Restty guide](restty-development.md#pinned-inputs-and-wasm-core-rebuild).

For the fixture adapter's readiness, early-exit and failed-start protocol, see
[Supervised PTY acquisition](native-test-reference.md#supervised-pty-acquisition). Acquisition does not
establish native-resource quiescence or fixture settlement.

Windows public kill/resize still
defer until first output; controlled callback-order units are not native timing
qualification or proof of containment of later native resize exceptions.

## Test discovery

Vitest discovers `*.test.*` and `*.spec.*` files under `test/unit/` and `test/integration/`. Support code lives in `test/fixtures/`.

- `npm test -- test/unit` — runs fast, headless unit tests only.
- `npm test` — runs the full default suite (unit + integration).
- `npm run test:integration` — runs `test/integration/local-shell.test.ts` only.
- `npx vitest list --filesOnly --json` — lists discovered test files without running them.

Test runs write Vitest's raw JSON to `.scratch/vitest-results.json`. Confirm that the report belongs to the current invocation, and preserve it with the command, selected scope/configuration, exit status, and terminal output before another run overwrites it. A nonzero exit remains a failure regardless of JSON counters.

In pinned Vitest 4.1.12:

- `num*TestSuites` includes nested suites, not just files, and is not an executed-file count. Entries in `testResults` identify reported files, not proof that they ran.
- During fail-fast, unreached files can appear as `passed` with empty `assertionResults`. An empty array alone does not distinguish an unreached file from an empty or collection-failed file. Preserve file-level failures and messages, including collection errors.
- Nonempty `assertionResults` represents collected test cases, not proof that all their bodies ran. Count entry statuses (`passed`, `failed`, `pending`, `skipped`, `todo`) separately; aggregate `numPendingTests` can differ from the number of `pending` entries. Pending is not an intentional skip or a pass.

Do not infer full-suite execution coverage from aggregate counters or empty passed entries.

## Running native tests

> **Warning:** Graphical integration tests open and focus real Electron windows. Run them on an unlocked, logged-in desktop with WebGL2 support. Leave the mouse and keyboard idle during the run, do not resize or switch windows, and run only one graphical test suite at a time per desktop.

<a id="qualification-scope"></a>

### Qualification scope

`npm run check:portable` is the baseline for every code change (formatting, lint, typecheck, the default Vitest suite, and an unpackaged build). Before running it:

- Linux display relaunch selects `APPIMAGE` only when `APPDIR/omxterm` matches the current executable, preventing development Electron from relaunching an inherited outer AppImage; terminal environment propagation is unchanged ([ADR 0020](adr/0020-default-linux-rendering-to-x11.md)). [#609](https://github.com/luizomf/omxterm/issues/609) records the bounded Fedora/Ubuntu reproductions and corrected About/packaged-relaunch checks, not a diagnosis of every historical startup failure or all-platform qualification.
- Known runtime limitations that tests account for are listed in the [Restty guide](restty-development.md#current-runtime-limitations).
- Linux runs that include `terminal-popup-native` (including the full suite) need the explicitly provisioned [native-input lane](native-test-reference.md#native-terminal-popup-and-input-provisioning). Set `OMXTERM_TEST_PROVISIONED_NATIVE_INPUT=1` only after provisioning it. Missing prerequisites fail; they are not skipped as successful qualification.

### Focused checks

The separately built [Mirror Typing preview](mirror-typing.md#build-from-source)
has its own archive builder, manifest compatibility and licensed payload. Its
build receipt is not native installed-host qualification; see the guide's
[capability contract](mirror-typing.md#capability-and-lifetime).

The [internal extension backend runtime](extension-backend-runtime.md) has an
explicit `npm run build:extension-runtime` artifact and actual native process/store
tests. Normal macOS and Linux ARM64 `npm run build` also includes the runtime
and native lease and Files move addons for the
[Files preview](files-development-preview.md). Linux ARM64 and preparatory macOS
ARM64 application startup construct infrastructure without activating installed
code; explicit shared actions activate it. The opt-in
[macOS production-composition fixture](macos-extension-composition.md#installed-package-production-fixture)
uses an ordinary build and a minimal installed archive, without selecting the
installed Snippets implementation or implying macOS Files support.
Files remains a separately built archive.
The runtime's default integration wrapper launches real Electron/Node children even
without opening windows; use an assigned native environment. No application
startup activation, package/fuse/signing qualification or public SDK follows from
building that artifact. Controlled lifecycle tests under `test/unit/extension-runtime-*`
remain headless and do not execute the native addon.

While iterating on a specific subsystem, you can run targeted test files before running the full suite. Detailed prerequisites and evidence boundaries are in the [native subsystem fixture reference](native-test-reference.md):

- [Host, hover and font lifecycle](native-test-reference.md#host-hover-and-font-lifecycle)
- [Restty host PowerShell isolation](native-test-reference.md#restty-host-powershell-isolation)
- [Host output evidence](native-test-reference.md#host-output-evidence)
- [Resize and continued-text coverage](native-test-reference.md#resize-and-continued-text-coverage)
- [Host/oracle phase receipts](native-test-reference.md#hostoracle-phase-receipts)
- [Auxiliary panel and shortcut capture](native-test-reference.md#auxiliary-panel-and-shortcut-capture)
- [Native terminal popup and input provisioning](native-test-reference.md#native-terminal-popup-and-input-provisioning)
- [Window chrome, About and drag geometry](native-test-reference.md#window-chrome-about-and-drag-geometry)
- [Settings layout](native-test-reference.md#settings-layout)
- [Split, language and theme smoke checks](native-test-reference.md#split-language-and-theme-smoke-checks)
- [Fixture ordering and failure controls](native-test-reference.md#fixture-ordering-and-failure-controls)

| Subsystem                                      | Command                                                                                                                                                                                       |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rendering, appearance, and cursor              | `npx vitest run test/integration/restty-rendering.test.ts test/integration/restty-appearance-rendering.test.ts test/integration/restty-cursor-rendering.test.ts`                              |
| Tab removal readiness                          | `npx vitest run test/unit/tab-removal-readiness.test.ts test/integration/tab-removal.test.ts`                                                                                                 |
| Host image, output, and reload oracles         | `npx vitest run test/integration/restty-host-oracles.test.ts`                                                                                                                                 |
| Integrated host and retained sessions          | `npx vitest run test/integration/restty-host-integration.test.ts`                                                                                                                             |
| Scrollback readiness and input                 | `npx vitest run test/integration/restty-native-scroll-feedback.test.ts test/integration/restty-scrollback-rendering.test.ts`                                                                  |
| Hover and local-image activation               | `npx vitest run test/unit/restty-hover-evidence.test.ts test/unit/restty-hover-readiness.test.ts test/integration/restty-hover-readiness.test.ts test/integration/local-image-native.test.ts` |
| Snippets auxiliary host                        | `npx vitest run test/integration/auxiliary-panel.test.ts`                                                                                                                                     |
| Native window controls                         | `npx vitest run test/integration/window-chrome.test.ts test/integration/restty-cursor-rendering.test.ts`                                                                                      |
| About startup                                  | `npx vitest run test/integration/application-about.test.ts`                                                                                                                                   |
| Native failure acknowledgement                 | `npx vitest run test/integration/failure-acknowledgement.test.ts`                                                                                                                             |
| Initialization cancellation and font ownership | `npx vitest run test/integration/initialization-cancellation.test.ts test/integration/surface-font-ownership.test.ts`                                                                         |
| Literal argv                                   | `npx vitest run test/integration/literal-argv.test.ts test/unit/postinstall.test.ts`                                                                                                          |
| Unix native resize failure                     | `npx vitest run test/integration/terminal-resize-race.test.ts test/unit/terminal-resize-failure.test.ts`                                                                                      |
| Linux foreground Busy decision                 | `npx vitest run test/unit/linux-foreground.test.ts test/unit/postinstall.test.ts test/integration/linux-foreground.test.ts`                                                                   |

<a id="host-hover-and-font-lifecycle"></a>

Host, hover and font lifecycle: [fixture reference](native-test-reference.md#host-hover-and-font-lifecycle).

<a id="auxiliary-panel-and-shortcut-capture"></a>

Auxiliary panel and shortcut capture: [fixture reference](native-test-reference.md#auxiliary-panel-and-shortcut-capture).

<a id="native-terminal-popup-and-input-provisioning"></a>

Native terminal popup and input provisioning: [fixture reference](native-test-reference.md#native-terminal-popup-and-input-provisioning).

<a id="window-chrome-about-and-drag-geometry"></a>

Window chrome, About and drag geometry: [fixture reference](native-test-reference.md#window-chrome-about-and-drag-geometry).

<a id="settings-layout"></a>

Settings layout: [fixture reference](native-test-reference.md#settings-layout).

<a id="split-language-and-theme-smoke-checks"></a>

Split, language and theme smoke checks: [fixture reference](native-test-reference.md#split-language-and-theme-smoke-checks).

<a id="fixture-ordering-and-failure-controls"></a>

Fixture ordering and failure controls: [fixture reference](native-test-reference.md#fixture-ordering-and-failure-controls).

### Opt-in native test suites

Several specialized integration suites are skipped by default and enabled via environment variables:

| Suite                        | Command                                                                                                                                | Notes                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| macOS fullscreen blur        | `OMXTERM_TEST_MACOS_FULLSCREEN=1 npx vitest run test/integration/macos-window-blur.test.ts`                                            | Exercises native macOS fullscreen transitions for direct blur and HUD fallback.               |
| AltGr layout boundary        | `OMXTERM_TEST_ALTGR_NATIVE=1 npx vitest run test/integration/altgr-native.test.ts`                                                     | Requires an active US International AltGr layout (and `/dev/uinput` on Linux).                |
| Font stroke evidence         | `OMXTERM_FONT_STYLES_EVIDENCE_PATH="$PWD/.scratch/font-obs.json" npx vitest run test/integration/restty-font-styles-rendering.test.ts` | Saves comparison JSON and synthetic glyph PNG captures alongside the test run.                |
| Local-image preview capacity | `OMXTERM_TEST_IMAGE_CAPACITY=1 npx vitest run test/integration/local-image-capacity-native.test.ts`                                    | Measures repeated 64 MiB preview open/close cycles into `.scratch/local-image-capacity.json`. |
| `tmux` host comparison       | `OMXTERM_TEST_IMAGE_TMUX=1 npx vitest run test/integration/restty-host-integration.test.ts`                                            | Requires `tmux` installed on a POSIX desktop.                                                 |

<a id="interruption-regressions"></a>

#### Interruption regressions

These opt-in suites deliberately terminate fixture-owned processes to test cleanup and recovery. Run them only inside a disposable VM:

```sh
OMXTERM_TEST_NATIVE_INTERRUPTION=1 npm test -- test/integration/native-fixture-interruption.test.ts test/integration/native-fixture-early-exit.test.ts
```

On Windows, additional WMI outcome and bootstrap suites are available:

```powershell
$env:OMXTERM_TEST_NATIVE_INTERRUPTION = '1'
npm test -- test/integration/native-fixture-interruption.test.ts test/integration/native-fixture-early-exit.test.ts test/integration/native-fixture-outcome-windows.test.ts test/integration/native-fixture-bootstrap-windows.test.ts
Remove-Item Env:OMXTERM_TEST_NATIVE_INTERRUPTION
```

<a id="evidence-reuse-and-packaging"></a>

### Packaging and verification commands

ARM64 complete native checks (and optional full x64 checks) run `check:portable`, build the platform installer into `release/`, and verify the packaged artifact locally (without publishing):

| Platform      | Complete native check                                            |
| ------------- | ---------------------------------------------------------------- |
| macOS ARM64   | `npm run check`                                                  |
| Linux ARM64   | `npm run check:linux`                                            |
| Windows ARM64 | `npm run check:win -- --disposable-vm-allow-omxterm-replacement` |
| Windows x64   | `npm run check:win -- --disposable-vm-allow-omxterm-replacement` |

> **Warning:** Full Windows verification (`check:win` or `package:verify` with `--disposable-vm-allow-omxterm-replacement`) runs the NSIS installer and can replace an existing OMXTerm installation on the machine. Run it only in a disposable VM with a recovery snapshot ([Windows release procedure](release.md#windows-arm64-and-x64)). To verify only the unpacked Windows app directory without running the installer, use:
>
> ```powershell
> npm run package:win        # ARM64; use npm run package:win:x64 on x64
> npm run package:verify -- --windows-unpacked-only
> ```

The exact Windows verifier requires installed-payload removal independently of
registration/shortcut/process cleanup: the custom installation root must be
absent or a real empty directory. Non-recursive removal preserves unexpected
residual files/directories as failure evidence; exact owned-cache cleanup and
later relocated-uninstaller cleanup do not establish payload removal.
Headless controlled-command regressions exercise the actual transaction with real
files (including cleared registrations but retained payload):
`npm test -- test/unit/windows-installer-transaction.test.ts test/unit/windows-installer-verification.test.ts test/unit/windows-verification-options.test.ts`.
These tests do not execute NSIS or PowerShell, reproduce an installer defect, or
replace disposable-Windows exact-installer qualification.

For native x64 **build-only** delivery, use `npm run package:linux:x64` or
`npm run package:win:x64`, then `npm run package:verify -- --inspection-only`.
This mode never launches a GUI, executes NSIS or installs the Linux helper. It
performs package-content checks and loads the exact packaged addon through
Electron Run-as-Node; Linux also runs bounded real PTY exec-status checks.
Desktop/GPU/installer and ordinary-user integration remain unverified, not gates
for these lanes. `--windows-unpacked-only` is **not** headless: it still launches
the application. See [hosted artifact delivery](release.md#hosted-x64-build-only-artifact-delivery).

macOS ARM64 package verification (also with `--inspection-only`) checks the
unpacked extension lease and Files move addons, complete ad-hoc seal,
architecture/deployment floor and packaged Node-mode store/lease/bootstrap resolution. Prepared and
final hashes are recorded in `.scratch/extensions-package.json`; native bytes
may differ after signing, but JavaScript must match exactly. Both macOS and Linux
ARM64 run Files no-clobber move/conflict checks. This is not full macOS Files,
backend activation, production platform admission or Snippets qualification.

See [release procedures](release.md#resume-and-version-only-commands) for standalone `package:*` and `package-built:*` commands.

### Linux packaged startup teardown

The full Linux verifier observes launch errors, native exit code/signal and stream
closure from launch. Its controlled PTY output receipt identifies the Electron
main and probe; the verifier checks owned ancestry, process start identity and
exact inspected executable bytes before sending TERM **only to main**, using a
pidfd to prevent PID-reuse signaling. Chromium children and an extract-and-run
AppImage wrapper remain alive for orderly shutdown. Descendants are retained by
identity, including PTYs in separate sessions. Before any application or wrapper
control launch, a bounded Python helper check opens a pidfd for itself and sends
signal 0 through it. Missing Python, APIs or kernel support blocks the launch;
there is no numeric-PID fallback.

Before trusting an extract-and-run wrapper's result, headless controls on that
exact AppImage must propagate native Run-as-Node exit 0, exit 3 and signal failure.
These controls intercept the reviewed bash AppRun via a private `BASH_ENV` script;
they do not launch Electron GUI or alter the package. A wrapper that masks a
failure is rejected. The wrapper's result is not a separate kernel wait of main;
a signal may be normalized to a nonzero wrapper code.

Success requires code 0/no signal, closed streams and owned settlement within
the existing two-second shutdown bound. Bounded identity-checked tree TERM/KILL
is failure recovery only, never success. Failures retain the isolated profile,
inspection/helper trees, and bounded stderr plus `linux-process-result.json` for
teardown failures. Recovery validates retained immutable PID/start identities,
allowing ordinary reparenting as parents exit; first-signaling main still requires
strict ancestry/group/executable checks. Independent recovery targets are all
attempted and errors aggregated. Failed wrapper controls retain bounded output,
native results and ownership snapshots before/after cleanup, even when cleanup
fails; recording errors join rather than replace the original failure.
Helper provisioning and macOS/Windows shutdown policies are unchanged.

Headless Linux regression coverage (real main, Chromium-like child, separate-session
PTY and reaping/masking wrappers; no desktop required):

```sh
npm test -- test/unit/linux-packaged-process.test.ts test/unit/packaged-application-verifier.test.ts
```

These process tests skip on other OSes. They do not replace exact-package desktop
verification in direct/FUSE and extract-and-run modes.

<a id="restty-host-powershell-isolation"></a>

Restty host PowerShell isolation: [fixture reference](native-test-reference.md#restty-host-powershell-isolation).

<a id="host-output-evidence"></a>

Host output evidence: [fixture reference](native-test-reference.md#host-output-evidence).

<a id="resize-and-continued-text-coverage"></a>

Resize and continued-text coverage: [fixture reference](native-test-reference.md#resize-and-continued-text-coverage).

<a id="hostoracle-phase-receipts"></a>

Host/oracle phase receipts: [fixture reference](native-test-reference.md#hostoracle-phase-receipts).

## Fixture ownership and cleanup

- [Linux packaged-wrapper controls](native-test-reference.md#linux-packaged-wrapper-controls)
- [Graphical fixture supervision](#graphical-fixture-supervision)
- [Supervised PTY acquisition](native-test-reference.md#supervised-pty-acquisition)
- [Windows cleanup diagnostics](native-test-reference.md#windows-cleanup-diagnostics)

<a id="linux-packaged-wrapper-controls"></a>

Linux packaged-wrapper controls: [fixture reference](native-test-reference.md#linux-packaged-wrapper-controls).

### Graphical fixture supervision

Graphical integration tests use [`runNativeFixture`](../test/fixtures/run-native-fixture.ts) and [`prepareFixture`](../test/fixtures/prepare-fixture.ts) to manage temporary user profiles, child Electron processes, and PTYs (`spawnFixturePty` / `spawnFixtureProcess`):

- Fixture diagnostics and stdout/stderr logs are written under `.scratch/native-fixtures/`.
- The supervisor removes temporary profiles only after verifying that child processes have exited and streams have closed.
- If a fixture process cannot be cleanly verified on exit, it writes an `ownership-blocked.json` receipt in `.scratch/native-fixtures/` and blocks further launches in that scope until inspected (except for abandoned Windows pre-bootstrap receipts whose parent process has already exited, which are archived automatically).

To run the unit tests for fixture preparation and supervision headlessly:

```sh
npx vitest run test/unit/fixture-preparation.test.ts test/unit/fixture-preparation-recipes.test.ts test/unit/fixture-preparation-callers.test.ts test/unit/native-preparation-ownership.test.ts test/unit/run-native-fixture-windows.test.ts test/unit/native-fixture-recovery.test.ts
```

<a id="supervised-pty-acquisition"></a>

Supervised PTY acquisition: [fixture reference](native-test-reference.md#supervised-pty-acquisition).

<a id="windows-cleanup-diagnostics"></a>

Windows cleanup diagnostics: [fixture reference](native-test-reference.md#windows-cleanup-diagnostics).
