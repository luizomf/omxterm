# Native development reference

Start with [Contributing](../CONTRIBUTING.md#development-environment) to clone the repository, install dependencies, and run OMXTerm in development mode. This guide covers OS-specific prerequisites, running unit and graphical integration tests, and verifying native packages.

See the [Restty guide](restty-development.md) for Terminal Surface internals and [release procedures](release.md) for full release builds.

## Platform prerequisites

Development targets native ARM64 macOS and ARM64/x64 Linux and Windows with **Node.js 22.13+ (22.x) or 24+** and npm. When working inside a virtual machine, clone and build on the guest's native filesystem rather than a shared host folder.

### macOS

Install **Xcode Command Line Tools** (`xcode-select --install`) before running `npm ci`.

- `postinstall` compiles the pinned Unix `node-pty` native addon.
- `npm run build` compiles the separate `native/macos-window-blur.mm` and `native/macos-option-shortcut.mm` addons using bundled Node-API headers (targeting macOS 12.0+).

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
- [`linux-appimage-launcher`](../test/integration/linux-appimage-launcher.test.ts) prepares a private copy of the pinned `app-builder-lib` package under `.scratch/`, leaving the installed dependency unchanged. It runs the generated AppRun through Bash, which then executes the temporary application stub. Production Linux packaging still prepares and guards the installed dependency's exact reviewed bytes.
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

On **Windows ARM64**, ordinary `npm run build`, `npm run dev`, and the build
phase of `npm run check:portable` compile the extension lease addon. Install
Visual Studio C++ Build Tools with native ARM64 compiler/linker and Windows SDK
ARM64 libraries. Open an ARM64 native-tools developer shell as the ordinary
user. Alternatively, in `cmd.exe`, `call` the installed `vcvarsall.bat arm64`
and start `powershell.exe` from that initialized shell; invoking the batch file
directly from PowerShell does not update PowerShell's environment. Verify
`$env:VSCMD_ARG_TGT_ARCH` is `arm64`, and `where.exe cl.exe` and
`where.exe link.exe` resolve the expected toolchain. Provision a trusted ARM64
`node.exe` import library exporting the required Node-API 8 symbols from a
compatible Node release and verify its provenance and architecture. Set
`OMXTERM_NODE_IMPORT_LIBRARY` to its **absolute** path in that shell, for example:

```powershell
$env:OMXTERM_NODE_IMPORT_LIBRARY = 'C:\tools\node-arm64\node.lib'
npm.cmd run build
```

The example path is a placeholder, not an included library. The build uses
locked `node-api-headers`, delay-loads `node.exe` against the running
Node/Electron executable, and neither downloads nor provisions an import
library or compiler. The MSVC import library and export sidecars are build
intermediates kept in the selected native output directory; runtime loads the
`.node` addon, not those sidecars. Native ARM64 Node and a matching Visual C++
runtime are required. Windows x64 ordinary builds also select the extension runtime;
they require an x64 MSVC/SDK environment and an architecture-matched import library
in the same way. The hosted x64 lane pins Node 24.22.2 and its verified official
import library. This packaging prerequisite does not admit production extensions
or replace built-in Snippets. The
[Windows composition fixture](windows-arm64-extension-composition.md) describes
its additional native evidence boundary; source admission is not package or
installer qualification.

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

## Dependency maintenance traps

`@electron/asar` is used both directly and by `app-builder-lib`, which packages
`app.asar`. Two advisories currently report on those trees and neither justifies a
dependency change; see [#756](https://github.com/luizomf/omxterm/issues/756)
and [#763](https://github.com/luizomf/omxterm/issues/763#issuecomment-6722547699) for
the advisory dispositions.

Do **not** force `minimatch@11` under `@electron/asar@3.4.1`. Its
`createPackageFromFiles()` unpack-pattern path calls the CommonJS default import
(`minimatch_1.default(...)`), but `minimatch@11` has no default export, so that
call fails if reached. The locked `electron-builder` instead uses
`createPackageFromStreams()`, which does not make that call. `listPackage()`
reads an existing archive; the reported successful-empty `app.asar` cause is not
established.

Check packaging, not just the audit, whenever a tooling dependency in the asar or
electron-builder tree changes:

```sh
# Shipped runtime is unaffected by these dev-only entries.
npm audit --omit=dev

# Check a real packaged archive, for example the one electron-builder just
# produced. A nonempty list alone does not verify its full contents.
node -e "const {listPackage}=require('@electron/asar');const files=listPackage(process.argv[1]);if(files.length===0)throw Error('empty asar');console.log(files.length+' entries')" path/to/resources/app.asar
```

## Test discovery

Vitest discovers `*.test.*` and `*.spec.*` files under `test/unit/` and `test/integration/`. Support code lives in `test/fixtures/`.

- `npm run test:unit` — runs the headless unit tests in parallel (about a minute). Use it after every change.
- `npm run test:panel-cancellation` — runs only the held-activation cancellation cases in Node with GC enabled, including the post-cancel collection discriminator. `check:portable` and both x64 CI lanes require this headless check; ordinary unit runs skip the collection case without `--expose-gc`.
- `npm test` — runs the full default suite (unit + integration).
- `npm run test:integration` — runs `test/integration/local-shell.test.ts` only.
- `npx vitest list --filesOnly --json` — lists discovered test files without running them.

The optional Files toolbar browser test uses an explicitly supplied headless
Chromium executable and synthetic host/backend responses:

```sh
OMXTERM_TOOLBAR_CHROMIUM=/absolute/path/to/headless-chromium npm test -- test/integration/files-toolbar-browser.test.ts
```

It checks real browser hit-testing, scrolling and layout without Electron or a
desktop. Set `OMXTERM_TOOLBAR_EVIDENCE` to a
private output directory to retain synthetic screenshots. This is not native or
packaged-app qualification.

The repository's `vitest.config.cts` sets Vite's root-relative `cacheDir` to
`.scratch/vite`, so Vitest result caches and Vite optimizer artifacts belong to
the selected worktree/project root, not a shared `node_modules` target. The CJS
config form also keeps Vite's config bundling in memory: an ESM config would
still write temporary modules under `node_modules/.vite-temp` before its
`cacheDir` setting is read. Do not rely on `--no-cache` or a private reporter path
to make linked dependencies read-only. Cache entries are cumulative scheduling
and optimization state, not evidence of the current invocation's execution or
coverage.

Named projects must inherit this policy or select their own owned cache location;
custom configs/CLI overrides are not sandboxed by the repository config. The
optional experimental filesystem-module cache has a separate path setting and
is not enabled here; enabling it requires an owned location too. Do not delete
shared historical caches or claim their unknown original state was restored.
The Node-only cache regression runs the pinned CLI with disposable shared
cache destinations, multiple workers, inherited nested projects, dependency
optimization and a symlinked working-directory alias; it does not qualify native
or browser behavior.

Test runs write Vitest's raw JSON to `.scratch/vitest-results.json`, and the
next run overwrites it. Trust the exit status: a nonzero exit is a failure
whatever the JSON counters say, and the counters don't prove which test bodies
actually ran.

Theme discovery's count/scan limits use controlled filesystem streams in
`test/unit/settings-theme-limits.test.ts`: exact/full and overflowing inputs
assert truncation, bounded iteration/reads and handle settlement without creating
thousands of files. `test/unit/settings-themes.test.ts` retains real filesystem,
link, validation and serialized Settings-service coverage. These are work bounds,
not a native filesystem throughput benchmark; the redesign does not establish the
cause of historical Windows fixture timeouts or `ENOTEMPTY` teardown failures.

The ASAR cancellation unit sets glob's `cwd` to its input directory so the injected
filesystem remains on that Windows drive when the checkout and `TEMP` differ.
It requires hook entry, abort, the exact rejection, pending-read settlement,
no extra crawl and no archive; operation settlement before hook entry fails
explicitly rather than leaving an unjoined rejection assertion.

## Running native tests

> **Warning:** Graphical integration tests open and focus real Electron windows. Run them on an unlocked, logged-in desktop with WebGL2 support. Leave the mouse and keyboard idle during the run, do not resize or switch windows, and run only one graphical test suite at a time per desktop.

If a test can't run on your machine, report it as unrun and keep going.
Missing coverage is weighed case by case, not treated as an automatic release
blocker ([ADR 0019](adr/0019-support-native-arm64-releases-on-macos-linux-and-windows.md#verification-and-evidence-reuse)).

<a id="shared-clipboard-before-native-tests"></a>
<a id="linux-desktop-services-and-native-verification"></a>
<a id="macos-preferences-and-native-verification"></a>
<a id="macos-console-admission"></a>

### Side effects on your desktop

Native tests run the real app against your real user session. A temporary
`HOME`, XDG, or Electron profile directory separates app files, but not these:

- **Clipboard:** some default tests write to the system clipboard (see the
  [fixture clipboard map](native-test-reference.md#fixture-clipboard-boundaries)).
  If you run tests inside a VM with clipboard sharing on, the writes reach the
  host too.
- **macOS preferences and Keychain:** source and packaged runs can write the
  `com.github.Electron` and `com.otaviomiranda.omxterm` preference domains, and
  Chromium may show Keychain prompts.
- **Linux desktop services:** Electron can start or reuse per-user services such
  as the document portal on your session bus.

If you care about that state, run native tests in a VM or a spare user account.
Keep the Chromium sandbox enabled; don't disable it to make a test setup work.

<a id="qualification-scope"></a>

### Qualification scope

`npm run check:portable` is the complete source check (formatting, lint, typecheck,
the default Vitest suite and an unpackaged build). Use [ADR 0019](adr/0019-support-native-arm64-releases-on-macos-linux-and-windows.md#verification-and-evidence-reuse)
to select focused checks for a narrow change and reuse matching results. Before
a run that includes graphical tests:

- Linux display relaunch selects `APPIMAGE` only when `APPDIR/omxterm` matches the current executable, preventing development Electron from relaunching an inherited outer AppImage; terminal environment propagation is unchanged ([ADR 0020](adr/0020-default-linux-rendering-to-x11.md)). [#609](https://github.com/luizomf/omxterm/issues/609) records the bounded Fedora/Ubuntu reproductions and corrected About/packaged-relaunch checks, not a diagnosis of every historical startup failure or all-platform qualification.
- Known runtime limitations that tests account for are listed in the [Restty guide](restty-development.md#current-runtime-limitations).
- Runs that include Window Chrome `settings-only` (including the full suite) need
  a selected display's logical usable work area large enough for the exact
  1920×1080 renderer viewport plus its observed native frame. Physical resolution
  alone is not the prerequisite. See the [Settings layout capacity check and
  focused command](native-test-reference.md#settings-layout) before a full run.
  If capacity is unavailable, leave those tests unrun and record the setup gap.
  An attempted run that fails the capacity check remains failed.
- Linux runs that include `terminal-popup-native` (including the full suite) need the explicitly provisioned [native-input lane](native-test-reference.md#native-terminal-popup-and-input-provisioning). Set `OMXTERM_TEST_PROVISIONED_NATIVE_INPUT=1` only after provisioning it. Missing prerequisites fail; they are not skipped as successful qualification.

#### Native dialog boundaries

Test OMXTerm's native-dialog boundary: payload validation, API arguments, requesting-owner lifetime, cancellation and error results, and file contents. For terminal export, combine focused automated checks with a representative manual native-chooser smoke using synthetic text: save a new file, cancel, accept overwrite, and refuse overwrite; verify saved UTF-8 bytes and that cancelled/refused actions leave existing files unchanged.

Exhaustive automation of OS-owned chooser widgets on every platform is not a routine delivery prerequisite. Expand native coverage for a demonstrated platform-specific product risk, and record what was actually exercised. Missing widget automation is an evidence limitation, not a product failure; actual crashes, failed assertions, privacy/ownership defects, and separately required packaging or release checks remain blockers.

### Focused checks

The separately built [Mirror Typing preview](mirror-typing-development.md#build-from-source)
has its own archive builder, manifest compatibility and licensed payload. Its
build receipt is not native installed-host qualification; see the guide's
[capability contract](mirror-typing-development.md#capability-and-lifetime).

The [internal extension backend runtime](extension-backend-runtime.md) has an
explicit `npm run build:extension-runtime` artifact and actual native process/store
tests. Normal macOS ARM64, Linux ARM64/x64 and Windows ARM64/x64 `npm run build`
includes the runtime and native lease addon; Windows x64 remains preparatory and
has no production extension admission. The Files move addon remains limited
to macOS and Linux ARM64 for the
[Files preview](files-development-preview.md). Admitted production targets construct
application infrastructure without activating installed code; explicit shared actions
activate it.
The opt-in shared production-composition fixture has distinct
[macOS](macos-extension-composition.md#installed-package-production-fixture) and
[Linux x64](linux-x64-extension-composition.md#installed-package-production-fixture) and
[Windows ARM64](windows-arm64-extension-composition.md#installed-package-production-fixture)
qualification boundaries. It uses an ordinary build and a minimal installed archive,
without changing Snippets selection or implying Files support.
Files remains a separately built archive.
The runtime's default integration wrapper launches real Electron/Node children even
without opening windows; use an assigned native environment. No application
startup activation, package/fuse/signing qualification or public SDK follows from
building that artifact. Controlled lifecycle tests under `test/unit/extension-runtime-*`
remain headless and do not execute the native addon.

Use targeted files for the affected subsystem; add broader checks when the change
needs them. Detailed prerequisites and evidence boundaries are in the [native subsystem fixture reference](native-test-reference.md):

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

| Suite                        | Command                                                                                                                                | Notes                                                                                                                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS fullscreen blur        | `OMXTERM_TEST_MACOS_FULLSCREEN=1 npx vitest run test/integration/macos-window-blur.test.ts`                                            | Exercises native macOS fullscreen transitions for direct blur and HUD fallback.                                                                                                     |
| AltGr layout boundary        | `OMXTERM_TEST_ALTGR_NATIVE=1 npx vitest run test/integration/altgr-native.test.ts`                                                     | Requires an active US International AltGr layout (and `/dev/uinput` on Linux).                                                                                                      |
| Font stroke evidence         | `OMXTERM_FONT_STYLES_EVIDENCE_PATH="$PWD/.scratch/font-obs.json" npx vitest run test/integration/restty-font-styles-rendering.test.ts` | Saves comparison JSON and synthetic glyph PNG captures alongside the test run.                                                                                                      |
| Local-image preview capacity | `OMXTERM_TEST_IMAGE_CAPACITY=1 npx vitest run test/integration/local-image-capacity-native.test.ts`                                    | Measures repeated 64 MiB preview open/close cycles into `.scratch/local-image-capacity.json`.                                                                                       |
| `tmux` host comparison       | `OMXTERM_TEST_IMAGE_TMUX=1 npx vitest run test/integration/restty-host-integration.test.ts`                                            | Requires `tmux` installed on a POSIX desktop.                                                                                                                                       |
| Performance benchmark        | `npm run perf:benchmark`                                                                                                               | Slow; real windows; reports numbers, does not gate regressions; part of the native lanes with `--fail-on-invalid`; see [the benchmark contract](#performance-regression-benchmark). |

<a id="performance-regression-benchmark"></a>

#### Performance benchmark

`npm run perf:benchmark` measures the built application through a fixed sequence
and writes `report.json` (machine-readable), `summary.md` (human summary) and
`raw-observations.json` (private per-repetition samples and supervisor receipts)
to `.scratch/performance-benchmark/run-*/artifacts/`. The raw file can contain
machine details and process identifiers; review or redact it before sharing. **It reports numbers; it does
not decide whether they are acceptable.** There is no threshold, no pass and no
fail: the run prints this run's measurements, prints the matching periods of the
recorded baseline beside them when the profile has one, and does not reject
numeric performance changes. Numeric regression calibration is separate work.
Operational errors (such as a missing build, unreadable baseline, fixture or
supervisor failure, or refused recording) still exit non-zero in either mode.
Before aggregation, every raw variant/repetition must carry the exact protocol
selected by the runner. A missing, malformed or different protocol refuses the
run in either mode, even when all observations agree with each other. The runner
preserves the original set in private `raw-observations.json` and writes a bounded
`failure.json` diagnostic identifying the variant/repetition without echoing the
untrusted ID; it creates no report, summary, comparison or baseline from that set.
If a later measurement launch fails, the completed raw prefix (including any
partial repetition group) is preserved without inventing missing observations;
`runtime` is null if no runtime result was collected. An invalid protocol already
in that prefix retains its indexed diagnostic instead of being hidden by the
later launch failure. Otherwise the original measurement error is reported.
This identity check does not change the workload, protocol digest, baseline
schema or report-only policy for numerical differences.

`--fail-on-invalid` additionally makes **data-integrity** findings exit non-zero: a missing metric, a stream repetition that did not complete,
an arrival below the declared payload, a failed keystroke observation, an
unverified idle window, an unapplied setting, an unstable grid, a missing
extension-runtime window, or an unexpected skip when a baseline exists. The
benchmark is opt-in: no check or release lane runs it, because its baseline is
tied to the machine that recorded it. Run it on one unlocked, idle desktop at a
time.

```sh
npm run build                # the benchmark measures the built application
npm run perf:benchmark       # report + summary; never writes a baseline
npm run perf:benchmark -- --fail-on-invalid   # also reject invalid observations
```

The CLI accepts only `--record`, `--replace`, `--fail-on-invalid` and
`--truncate-stream`; each flag is independent and repeating a known flag is
harmless. Arguments must be standalone supported flags: positional values,
empty arguments, delimiters and malformed forms are rejected. The nonzero
diagnostic identifies argument positions and supported options without echoing
rejected values. Invalid arguments are rejected before the Git check, scratch
creation, runner bundle build, benchmark execution or recording.

What runs:

- `dist/main/index.js` (production main, copied as fixture `main/index.mjs`), `dist/preload/index.cjs`,
  `dist/extension-runtime/*` and `dist/renderer/index.html` are copied from the
  build. The renderer entry is a fixture entry that calls the production
  `startTerminalWindow` composition and adds observation only, so
  `dist/renderer/index.js` is rebuilt from `src/` rather than copied. The
  consumed main, preload, renderer HTML/CSS/bundle and extension-runtime
  entry, package, bootstrap and native lease artifacts are hashed as provenance.
  The separately measured runtime records hashes from its own profile. Build
  hashes are not compared: different builds can use the same workload and machine.
- The fixture drives the production menu actions and the production input
  channel into the production Default Shell. Each tab replaces its shell with a
  fixed `sh` program that emits deterministic bytes; every tab, including the
  first, runs the same 10,000-line workload.
- The extension runtime is a separate application-owned instance measured by its
  own supervised fixture (production `ExtensionRuntime`, a real locally
  installed package, activated once). Its number is a single reference
  observation: production spawns no runtime until an extension activates.
- Sequence: 1, 3 and 6 tabs (each tab pays exactly one fixed workload), an idle
  window, four idle-CPU windows (cursor blink on/off × focused/unfocused), three
  sequential stream runs (plain ASCII, the same byte volume with glyph and colour
  variety, then ASCII again with deep history), a post-history quiet window and
  seven synthetic keystrokes.
  Each variant is measured in three fresh repetitions and **every repetition is
  printed individually** next to the others; the report medians only say
  "median of N repetitions" where a median is printed.

Measurement rules:

- Memory is a per-process proportional/exclusive metric, never resident set
  size: PSS from `/proc/<pid>/smaps_rollup` on Linux, `phys_footprint` from
  `footprint --json` on macOS, `PrivateMemorySize64` on Windows. Electron's
  `memory.workingSetSize` and `process.getProcessMemoryInfo` are recorded as
  reference data only.
- Main, renderer, GPU, utility, the extension runtime and fixture PTY shells are
  separate rows. Totals contain the application roles only; fixture shells are
  never part of a total. Non-additive metrics also cannot combine multiple
  processes within one role: those role aggregates are unavailable and invalidate
  the observation rather than summing shared memory.
- Steady values are the retained floor (the minimum) of five samples taken after
  a memory settle that starts from an explicit renderer collection
  (`--js-flags=--expose-gc`, reported as `rendererGcAvailable`). Peak values are
  the maximum over the stream samples and the post-stream read, printed per
  repetition; they are observed maxima at the metric's sampling cadence (15 ms on
  Linux, slower where one reading costs a process launch), not kernel high-water
  marks.
- Idle and post-history growth are endpoint deltas over the interval the samples
  span, and the quiescence probe brackets that same interval (silent PTY output,
  unchanged grid and unchanged output bytes; draws are recorded, not required to
  be zero). Settled samples must be chronological over at least four sampling
  intervals; idle and CPU windows must span at least their configured durations.
  Stream-group endpoints must be chronological, bracketed by the pre-stream and
  post-stream samples. Step settles are labelled "before sampling" and idle
  windows "across the sampled window".
- Idle CPU readings are collected over the interval bracketed by the before/after
  quiescence probes, reported per window and as the median across the four
  windows, for every measured application process (main, renderer, GPU). After
  sampling and the final probe, the fixture compares the probes for unchanged
  PTY output bytes and grid; a failed comparison is reported as
  `quiescence-not-verified` and makes `--fail-on-invalid` exit non-zero, so the
  window is not accepted as verified quiescent. The renderer fixture has no
  permanent animation-frame loop, but `probeActivity()` calls `surfaces()` and
  reads visible
  Surface geometry before the `observerCostMs` timer starts. That path calls
  Restty's `updateSize(true)`, starting resize activity, marking rendering
  dirty, and resetting render time even when geometry is unchanged. The
  snapshot/refit is outside `observerCostMs`; later work, including `textHash`,
  is timed, so the metric is not total observer cost. This may contribute to
  idle work in sampled windows, but its magnitude and attribution to prior
  observations are unknown; historical recordings are not automatically
  invalidated. The `draws` count is instrumented WebGL `draw*`/`clear` calls, not
  complete frames or presentation. Active-output CPU is sampled while a fixed
  byte stream is arriving. The two axes are never merged. Focused/unfocused
  names are admitted only when the observed focus and visible-document state
  match; the summary prints those observations.
- Streams carry unique end tokens, so a marker retained by an earlier stream
  cannot satisfy a later wait. All three repetitions of a payload must complete
  and their arrival is checked against the declared bytes; each repetition's
  bytes and rate are printed. Throughput is "bytes delivered to the renderer and
  parsed into the grid", timed on the renderer clock from command write to marker
  observation. Renderer scheduling, PTY transport and observer cost remain in
  the interval; it is not paint timing. Per-stream observer costs are retained,
  and CPU and peak/retained memory cover the full three-stream group. The
  draw-counter advance during the stream is recorded, not claimed as presentation. The input axis is synthetic keydown to observed grid change
  (parse); the next draw after the change is a repaint counter, recorded as
  evidence and not called latency.
- The scrollback pair runs the same sequence with `scrollback.lines` at 10,000
  and 0 and prints the per-process delta at six tabs for each repetition.

Baseline preflight requires stored absolute byte counts—per-role step steady
and peak values, addable step totals, stream peaks, and extension-runtime steady
bytes—to be nonnegative safe integers. These values are min/max/sum results from
integer-byte samples, not averages. For extension-runtime aggregation, each
per-process absolute-byte value in every `RawRuntimeRun` sample must be a
nonnegative safe integer, and each addable per-sample sum must also be safe.
These checks apply after the platform memory reader has produced its per-process
byte values; they do not validate the original OS output before reader
processing. Any invalid or unavailable runtime memory sample makes both runtime
memory values unavailable and triggers `extension-runtime-incomplete`; CPU
remains independently reportable when its readings are valid. Required
primary-role observations remain required; optional secondary step-role
observations may be absent or null, and non-addable step totals remain null. Delivered stream byte counts must be safe integers within the
existing arrival range. Stored CPU percentages must be finite and nonnegative;
null remains valid where the profile permits unavailable CPU, and one-core
percentages may exceed 100. A nonnegative stored CPU aggregate does not establish
that historical raw CPU counters were monotonic. Derived differences remain
signed where appropriate, including per-tab marginals, idle/runtime growth,
stream retained-byte deltas and scrollback-pair deltas; per-tab marginals and
stream rates may be fractional.

Platform profiles: the memory metric and the baseline file are per platform, in
`PERFORMANCE_BENCHMARK_PROFILES`
(`test/fixtures/performance-benchmark-report.ts`); this section names the
profiles rather than restating their values.

| Profile        | Metric           | Baseline file                                | Comparison                                |
| -------------- | ---------------- | -------------------------------------------- | ----------------------------------------- |
| `linux-arm64`  | PSS              | `test/performance/baseline.linux-arm64.json` | recorded; printed beside a comparable run |
| `linux-x64`    | PSS              | none                                         | no measured machine class recorded        |
| `darwin-arm64` | `phys_footprint` | none                                         | no measured machine class recorded        |
| `win32-arm64`  | private bytes    | none                                         | no measured machine class recorded        |
| `win32-x64`    | private bytes    | none                                         | no measured machine class recorded        |

A comparison is printed only when the protocol, memory metric, machine class and identity,
content size, pixel ratio, renderer grid, settings file and renderer collection
availability all match the baseline; otherwise the summary prints the reasons
and no numbers side by side. A machine identity that does not match is never
compared. Unregistered platform combinations use a fallback profile with no
qualified baseline; recording a file there does not qualify that platform.

Recording a baseline:

```sh
npm run build
npm run perf:baseline                                   # first baseline
npm run perf:baseline -- --replace                      # same-machine replacement
```

Recording requires a clean tracked tree and a run with no blocking integrity
issue, and replacing an existing baseline requires `--replace`. The file stores
**per-repetition values for every measured family** (step steady and peak per
role, totals, both per-tab marginals, idle growth and CPU, each named CPU window
and the post-history window, every stream's arrival and rate, latency, the
scrollback pair, the extension runtime). Named windows are shown individually in
the run summary and retained in the baseline, but have no individual comparison
rows; the table compares retained aggregates. It also stores the
protocol, metric, machine identity, versions, build hashes, grid, applied font,
content size, pixel ratio and source commit. It carries no tolerance and no
acceptance status: a future gate can be calibrated from the data, which is where
that work belongs. Summary, repeat and integrity runs for the delivered benchmark
are retained under `docs/evidence/performance-830/`.

**What this does not prove.** The report lists each of these and a reader should
be able to predict a miss from them:

- Run-to-run variation and cold versus warm streams limit interpretation; the
  printed repetitions are descriptive, not an uncertainty bound.
- A uniform per-tab leak is not identified as a leak by this report; no
  allocation-shape verdict is computed.
- The idle window is about 12 s; slower growth may not be observable in it.
- Input latency is synthetic keydown to renderer grid observation; presentation
  latency (what a person sees) is not measured, and the grid-change-to-draw
  figure is a repaint counter.
- The extension-runtime window is a single observation.
- Only `linux-arm64` has a recorded baseline; every other platform reports and
  compares nothing.
- The workload is fixed. Regressions outside its exercises, other GPUs, shells,
  extensions or user configurations are outside what this run measures.
- Memory values are the platform metric named at the top; PSS, `phys_footprint`
  and private bytes are not interchangeable and absolute values are
  machine-specific.

Run this on a desktop you aren't using (a VM is safest; see
[side effects on your desktop](#side-effects-on-your-desktop)): the fixture opens,
focuses and blurs real windows repeatedly. Leave the mouse and keyboard
idle and run one graphical suite at a time.

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

Packaged and source launches, including `package:verify` in FULL and
inspection-only modes, have the same
[side effects on your desktop](#side-effects-on-your-desktop) as graphical tests.

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
Before installation, the verifier binds its own new temporary directory to a
native long path and matching object identity. This handles Windows 8.3 `TEMP`
aliases without relaxing existing registration/shortcut/cache checks. Unsafe
resolved paths, identity changes and original or resolved reparse/process/cache
conflicts fail before installer execution; temporary evidence is retained. See
[ADR 0023](adr/0023-verify-exact-nsis-only-in-authorized-disposable-vms.md).

Headless controlled-command regressions exercise the actual transaction with real
files (including modeled short/long Windows aliases and cleared registrations but retained payload):
`npm test -- test/unit/windows-installer-transaction.test.ts test/unit/windows-installer-verification.test.ts test/unit/windows-verification-options.test.ts`.
These tests mock Windows filesystem metadata/path resolution and command results;
they reproduce verifier defects, not actual NSIS behavior. They do not execute
NSIS or PowerShell or replace disposable-Windows exact-installer qualification.
A source correction does not reclassify an earlier failed installation or
permit replaying its retained transaction.

Current source also carries one exact public Snippets0.1.0 input for new packaged
profiles. Normal checkout/package preparation is offline and pinned; missing or
corrupt supported-target input fails the beforePack hook. Source build/development
opts out of provisioning. See [Default Snippets](default-snippets.md) for
`prepare:default-snippets`, exact target/resource checks, ordinary-profile test
scenarios and the published0.25.0 results/limits. Plan further checks for changed
inputs; keep earlier failures and unrun cases visible in the release decision.

For native x64 **build-only** delivery, use `npm run package:linux:x64` or
`npm run package:win:x64`, then `npm run package:verify -- --inspection-only`.
This mode never launches a GUI, executes NSIS or installs the Linux helper. It
performs package-content checks and loads the exact packaged addon through
Electron Run-as-Node; Linux also runs bounded real PTY exec-status checks.
Desktop/GPU/installer and ordinary-user integration remain unverified, not gates
for these lanes. Windows inspection and unpacked-only verification compare the
embedded app version to the source without requiring an installer artifact;
full Windows verification requires the versioned installer. `--windows-unpacked-only`
is **not** headless: it still launches the application. See [hosted artifact
delivery](release.md#hosted-x64-build-only-artifact-delivery).

Linux x64 builds also bundle the preparatory backend/InstalledPackages runtime
and explicitly unpack its native lease addon. Package verification (including
`--inspection-only`) checks exact bundled bytes, native architecture/unpacking,
and actual packaged Node-mode store/lease/bootstrap resolution, recording
`.scratch/extensions-package.json`. It neither builds nor admits the ARM64-only
Files move addon. [Production Linux x64 extension composition](linux-x64-extension-composition.md)
and the subsequent [optional Snippets source transition](snippets-migration.md#linux-x64-source-transition)
have separate evidence; package inspection is not distributed cutover or GUI qualification.

Windows ARM64 packaging explicitly unpacks `extension-leases.node` and excludes
its `.lib`, `.exp` and `.obj` build intermediates. The inspection-only verifier
requires the extension runtime and dependencies, checks native architecture and
unpacking, compares prepared/package bytes, and runs the packaged Electron
Node-mode store/lease/bootstrap probe. It does not admit the Files move addon or
change Windows x64 admission. One exact unpacked ARM64 app passed this
[inspection-only checkpoint](windows-arm64-extension-composition.md#packaged-runtime-checkpoint)
under a non-elevated Interactive/Limited account, including ordinary-user symlink
access. Inspection does not execute NSIS or itself qualify graphical composition,
installer behavior or Snippets migration. A later, separately bounded
[packaged-GUI checkpoint](windows-arm64-extension-composition.md#packaged-gui-composition-checkpoint)
exercised that retained package with a minimal local extension; it did not run an
installer or qualify a Snippets migration. A subsequent [exact-NSIS checkpoint](windows-arm64-extension-composition.md#exact-nsis-installer-checkpoint)
built a new installer from an independent copy and passed the stock FULL
verifier; the earlier inspection and GUI results retain their original scope.

macOS ARM64 package verification (also with `--inspection-only`) checks the
unpacked extension lease and Files move addons, complete ad-hoc seal,
architecture/deployment floor and packaged Node-mode store/lease/bootstrap resolution. Prepared and
final hashes are recorded in `.scratch/extensions-package.json`; native bytes
may differ after signing, but JavaScript must match exactly. Both macOS and Linux
ARM64 run Files no-clobber move/conflict checks. The same macOS addon now links
Foundation for trash; inspection checks its export and root refusal only. Actual
recoverable Trash semantics require the separate assigned
[native trash fixture](files-development-preview.md#build-and-evidence-boundary),
whose bounded exact-package evidence is recorded there. These probes are not full macOS Files,
backend activation, production platform admission or Snippets qualification.

The [Files exact-DMG fixture](../test/fixtures/files-dmg.md) keeps its qualified
local eleven-check lifecycle mode separate from the six-check qualified
[public-link mode](../test/fixtures/files-dmg.md#public-link-mode).
The latter uses real Settings HTTPS install/reinstall and the unchanged qualified
archive/host pair; it does not replay Trash/state matrices or alter the v1 catalog.
Neither mode substitutes for ordinary FULL package verification. The retained
dev.21 host separately passed the FULL startup/PTY output/privacy check and DMG
image verification; see the [exact evidence](files-development-preview.md#macos-link-first-distribution).
That run used matching dev.21 verifier source, not weakened version checks against
current main. No rebuild was needed merely because test/docs source advanced to dev.22.
Current source's macOS-specific catalog endpoint is a host application change:
public-catalog mode requires a new exact DMG containing that selection and its
own FULL/package/public-consumption evidence. It reuses the short distribution
scope, not the local eleven-check Trash/state campaign. The original dev.21
binary remains link-only for Files0.5; see the
[publication boundary](release.md#files-macos-catalog-publication).

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
- [Windows supervision cost and cleanup bound](native-test-reference.md#windows-supervision-cost-and-cleanup-bound)

<a id="linux-packaged-wrapper-controls"></a>

Linux packaged-wrapper controls: [fixture reference](native-test-reference.md#linux-packaged-wrapper-controls).

### Graphical fixture supervision

Graphical integration tests use [`runNativeFixture`](../test/fixtures/run-native-fixture.ts) and [`prepareFixture`](../test/fixtures/prepare-fixture.ts) to manage temporary user profiles, child Electron processes, and PTYs (`spawnFixturePty` / `spawnFixtureProcess`). They run in the caller's own desktop session and don't isolate per-user services; see [side effects on your desktop](#side-effects-on-your-desktop).

Within the fixture process/profile scope:

- Fixture diagnostics and stdout/stderr logs are written under `.scratch/native-fixtures/`.
- The supervisor removes temporary profiles only after verifying that child processes have exited and streams have closed. Its [cleanup-assistance classification](native-test-reference.md#supervisor-cleanup-assistance) distinguishes no observed attempt from attempted or unknown assistance; cleanup success alone is not natural Quit.
- If a fixture process cannot be cleanly verified on exit, it writes an `ownership-blocked.json` receipt in `.scratch/native-fixtures/` and blocks further launches in that scope until inspected (except for abandoned Windows pre-bootstrap receipts whose parent process has already exited, which are archived automatically).

To run the unit tests for fixture preparation and supervision headlessly:

```sh
npx vitest run test/unit/fixture-preparation.test.ts test/unit/fixture-preparation-recipes.test.ts test/unit/run-native-fixture-windows.test.ts test/unit/native-fixture-recovery.test.ts
```

<a id="supervised-pty-acquisition"></a>

Supervised PTY acquisition: [fixture reference](native-test-reference.md#supervised-pty-acquisition).

<a id="windows-cleanup-diagnostics"></a>

Windows cleanup diagnostics: [fixture reference](native-test-reference.md#windows-cleanup-diagnostics).
